//Include external modules
const { ApolloServer } = require("apollo-server");
const mongoose = require("mongoose");
//GraphQL declarations
const typeDefs = require("./graphQL/declarations.js");
//Mongo-schemas declarations
const employeeSchema = require("./DBSchemas/employeeSchema.js");
const shiftSchema = require("./DBSchemas/shiftSchema.js");
const scoringSchema = require("./DBSchemas/scoringSchema.js");
const eventSchema = require("./DBSchemas/eventSchema.js");
//Configuration
const configuration = require("./config.js");
//Compile models, for example with schema "employeeSchema" and collection name "Employees"
const modelEmployee = mongoose.model("Employees", employeeSchema);
const modelShift = mongoose.model("Shifts", shiftSchema);
const modelEvent = mongoose.model("Events", eventSchema);
const modelScoring = mongoose.model("Scoring", scoringSchema);

//resolvers for graphql
const resolvers = {
  Query: {
    employees: async (_, { type }, { Employee }) => {
      let employees = [];
      if (type === "all") {
        employees = await modelEmployee.find();
      } else if (type === "active") {
        employees = await modelEmployee.find({ isActive: true });
      } else return [];
      return employees;
    },
    shifts: async (_, { TS }, { Shift }) => {
      const days = await modelShift.find({
        start: {
          $gte: TS - configuration.shiftsOffset * 1000,
          $lt: TS + configuration.shiftsOffset * 1000
        }
      });
      return days;
    },
    events: async (_, { TS, employeeId, ackType }, { Event }) => {
      const month = getMonthsBorders(TS);
      const shifts = await modelShift.find({
        start: { $gte: month.start, $lt: month.end },
        employeeId: employeeId
      });
      var events = [];
      for (i in shifts) {
        events = events.concat(
          await modelEvent.find({
            tsStart: { $gte: shifts[i].start, $lt: shifts[i].end },
            ackType: ackType
          })
        );
      }
      return events;
    },
    scorings: async (_, { TS }, { Shift }) => {
      const month = getMonthsBorders(TS);
      const scorings = await modelScoring.find({
        TS: { $gte: month.start, $lt: month.end }
      });
      return scorings;
    }
  },
  Mutation: {
    addShift: async (_, { start, end, employeeId }, { Shift }) => {
      if (isShiftOk(start, end)) {
        const newShift = await new modelShift({
          start,
          end,
          employeeId
        }).save();
        await updateScoringForShift(newShift._id);
        return newShift;
      } else return null;
    },
    updateShift: async (_, { id, start, end, employeeId }, { Shift }) => {
      if (isShiftOk(start, end)) {
        let shift = await modelShift.findOneAndUpdate(
          { _id: id },
          {
            start: start,
            end: end,
            employeeId: employeeId
          },
          { new: true }
        );
        await updateScoringForShift(shift._id);
        return shift;
      } else return null;
    },
    deleteShift: async (_, { id }, { Shift }) => {
      shift = await modelShift.findOneAndRemove({ _id: id });
      return shift ? true : false;
    },
    addEmployee: async (
      _,
      { fullName, ADLogin, isRegular, visibleColor },
      { Employee }
    ) => {
      const newEmployee = await new modelEmployee({
        fullName,
        ADLogin,
        isRegular,
        visibleColor
      }).save();
      return newEmployee;
    },
    updateEmployee: async (
      _,
      { id, fullName, ADLogin, isRegular, visibleColor },
      { Employee }
    ) => {
      let employee = await modelEmployee.findOneAndUpdate(
        { _id: id },
        {
          fullName: fullName,
          ADLogin: ADLogin,
          isRegular: isRegular,
          visibleColor: visibleColor
        },
        { new: true }
      );
      return employee;
    },
    deleteEmployee: async (_, { id }, { Employee }) => {
      let employee = await modelEmployee.findOneAndUpdate(
        { _id: id },
        {
          isActive: false
        },
        { new: true }
      );
      return employee ? true : false;
    },
    restoreEmployee: async (_, { id }, { Employee }) => {
      let employee = await modelEmployee.findOneAndUpdate(
        { _id: id },
        {
          isActive: true
        },
        { new: true }
      );
      return employee ? true : false;
    },
    updateScorings: async (_, { TS }, { Employee }) => {
      //Ищем края месяца
      const month = getMonthsBorders(TS);
      //Для всех смен в месяце обновляем показатели
      await updateScoringsForShiftsForMonth(TS);
      //Собираем список сотрудников
      var ids = await thisMonthEmployeesId(TS);
      //Перебираем сотрудников
      for (var k in ids) {
        const shifts = await modelShift.find({
          start: { $gte: month.start, $lt: month.end },
          employeeId: ids[k]
        });
        var ackInTimeEventsCount = 0;
        var ackNotInTimeEventsCount = 0;
        var noAckEventsCount = 0;
        var tooShortEventsCount = 0;
        var normalEventsCount = 0;
        var freeDurationSum = 0;
        var avgAckTime = 0;
        var percentAckInTime = 0;
        var percentAckNotInTime = 0;
        var percentNoAck = 0;
        for (i in shifts) {
          if (
            shifts[i].normalEventsCount > 0 ||
            shifts[i].tooShortEventsCount > 0
          ) {
            ackInTimeEventsCount += shifts[i].ackInTimeEventsCount;
            ackNotInTimeEventsCount += shifts[i].ackNotInTimeEventsCount;
            noAckEventsCount += shifts[i].noAckEventsCount;
            tooShortEventsCount += shifts[i].tooShortEventsCount;
            normalEventsCount += shifts[i].normalEventsCount;
            freeDurationSum += shifts[i].freeDurationSum;
          }
        }
        if (normalEventsCount > 0) {
          //среднее время подтверждения
          avgAckTime =
            Math.round((100 * freeDurationSum) / (normalEventsCount * 60000)) /
            100;
          //% вовремя подтвержденных
          percentAckInTime = Math.round(
            (ackInTimeEventsCount * 100) / normalEventsCount
          );
          //% невовремя подтвержденных
          percentAckNotInTime = Math.round(
            (ackNotInTimeEventsCount * 100) / normalEventsCount
          );
          //% неподтвержденных
          percentNoAck = Math.round(
            (noAckEventsCount * 100) / normalEventsCount
          );
        } else {
          avgAckTime = 0;
          percentAckInTime = 0;
          percentAckNotInTime = 0;
          percentNoAck = 0;
        }
        //Удаляем старую оценку сотрудника
        await modelScoring.deleteMany({
          TS: { $gte: month.start, $lt: month.end },
          employeeId: ids[k]
        });
        //Добавляем новую оценку
        await new modelScoring({
          employeeId: ids[k],
          employeeFullName: await nameOfEmployee(ids[k]),
          TS: month.start,
          ackInTimeEventsCount: ackInTimeEventsCount,
          ackNotInTimeEventsCount: ackNotInTimeEventsCount,
          noAckEventsCount: noAckEventsCount,
          tooShortEventsCount: tooShortEventsCount,
          normalEventsCount: normalEventsCount,
          freeDurationSum: freeDurationSum,
          avgAckTime: avgAckTime,
          percentAckInTime: percentAckInTime,
          percentAckNotInTime: percentAckNotInTime,
          percentNoAck: percentNoAck
        }).save();
      }
      await giveMedals(TS);
      k++;
      console.log("Recalculation completed" + new Date());
      return k.toString();
    }
  }
};
//Раздает медали сотрудникам
async function giveMedals(TS) {
  const month = getMonthsBorders(TS);
  var scoringsMedals = [];
  var scorings = await modelScoring.find({
    TS: { $gte: month.start, $lt: month.end }
  });
  if (scorings.length > 0) {
    //TODO учесть вариант массива с нолями
    var theQuickest = { item: scorings[0], index: 0 };
    var theBest = { item: scorings[0], index: 0 };
    for (var i in scorings) {
      if (scorings[i].avgAckTime > 0)
        if (scorings[i].avgAckTime < theQuickest.item.avgAckTime)
          theQuickest = { item: scorings[i], index: i };
      if (scorings[i].percentAckInTime > theBest.item.percentAckInTime)
        theBest = { item: scorings[i], index: i };
      if (scorings[i].percentAckInTime >= configuration.goodAckInTimePercent) {
        await modelScoring.findOneAndUpdate(
          { _id: scorings[i]._id },
          {
            doneNorm: true
          },
          { new: true }
        );
      }
    }
    await modelScoring.findOneAndUpdate(
      { _id: scorings[theQuickest.index]._id },
      {
        theQuickest: true
      },
      { new: true }
    );
    await modelScoring.findOneAndUpdate(
      { _id: scorings[theBest.index]._id },
      {
        theBest: true
      },
      { new: true }
    );
  }
}

//Для указанного месяца выдает список id сотрудников, которые дежурили
async function thisMonthEmployeesId(TS) {
  const month = getMonthsBorders(TS);
  const shifts = await modelShift.find({
    start: { $gte: month.start, $lt: month.end }
  });
  var ids = [];
  for (i in shifts) {
    //Если такого id еще нет в массиве
    if (ids.indexOf(shifts[i].employeeId) == -1) {
      //То добавляем его
      ids.push(shifts[i].employeeId);
    }
  }
  return ids;
}
//Расчитать показатели для смены
async function updateScoringForShift(shiftId) {
  //Ищем смену по идентификатору
  let oneShiftArray = await modelShift.find({ _id: shiftId }).limit(1);
  if (oneShiftArray.length < 1) {
    console.log("Ошибка! Не найдена смена по идентификатору.");
    return;
  }
  let shift = oneShiftArray[0];
  //Выбираем события за смену
  let events = await modelEvent
    .find({
      tsStart: {
        $gte: Number.parseInt(shift.start),
        $lt: Number.parseInt(shift.end)
      }
    })
    .sort("tsStart");
  let ackInTimeEventsCount = 0;
  let ackNotInTimeEventsCount = 0;
  let tooShortEventsCount = 0;
  let noAckEventsCount = 0;
  let freeDurationSum = 0;
  for (i in events) {
    if (events[i].ackType === "inTime") {
      freeDurationSum += events[i].freeDuration;
      ackInTimeEventsCount++;
    } else if (events[i].ackType === "late") {
      freeDurationSum += events[i].freeDuration;
      ackNotInTimeEventsCount++;
    } else if (events[i].ackType === "none") {
      noAckEventsCount++;
    } else if (
      events[i].ackType === "tooShort" ||
      events[i].ackType === "maintenance"
    ) {
      tooShortEventsCount++;
    }
  }
  await modelShift.findOneAndUpdate(
    { _id: shiftId },
    {
      ackInTimeEventsCount: ackInTimeEventsCount,
      ackNotInTimeEventsCount: ackNotInTimeEventsCount,
      noAckEventsCount: noAckEventsCount,
      tooShortEventsCount: tooShortEventsCount,
      normalEventsCount: events.length - tooShortEventsCount,
      freeDurationSum: freeDurationSum
    }
  );
}
//Расчитать показатели для всех смен за месяц
async function updateScoringsForShiftsForMonth(TS) {
  //Ищем края месяца
  const month = getMonthsBorders(TS);
  //Собираем список смен за месяц
  const shifts = await modelShift
    .find({
      start: { $gte: month.start, $lt: month.end }
    })
    .sort("start");
  //Перебираем смены
  for (i in shifts) {
    //Для каждой смены считаем показатели
    await updateScoringForShift(shifts[i]._id);
  }
}
//Возвращает таймстемпы начала и конца месяца
function getMonthsBorders(TS) {
  var theDate = new Date(Number.parseInt(TS));
  var theStart = new Date(theDate.getFullYear(), theDate.getMonth());
  var theEnd = new Date(theStart.getFullYear(), theStart.getMonth() + 1);
  return { start: theStart.getTime(), end: theEnd.getTime() };
}
//Возвращает полное имя сотрудника по id
async function nameOfEmployee(employeeId) {
  let name = "";
  let employees = await modelEmployee.find();
  if (employees) {
    if (employees.length > 0) {
      name =
        employees[employees.findIndex(el => el.id === employeeId)].fullName;
    }
  }
  return name;
}
//Проверяет корректность начала и конца смены. True - ок, false - ошибка
function isShiftOk(start, end) {
  if (start > end) {
    console.log("Ошибка! Начало смены не может быть позднее конца.");
    return false;
  }
  if (end - start == 0) {
    console.log("Ошибка! Смена не может быть нулевой длины.");
    return false;
  }
  if (end - start > 24 * 60 * 60 * 1000) {
    console.log("Ошибка! Смена не может длиться более 24 часов.");
    return false;
  }
  return true;
}
//connect to mongodb-server
mongoose
  .connect(
    "mongodb://" +
      configuration.mongodb.DBHost +
      ":" +
      configuration.mongodb.DBPort +
      "/" +
      configuration.mongodb.DBName +
      "?retryWrites=true&w=majority",
    {
      useNewUrlParser: true,
      useFindAndModify: false
    }
  )
  .then(() =>
    console.log('Connected to DB "' + configuration.mongodb.DBName + '"')
  )
  .catch(err => console.error(err));

//create new Apollo server
const server = new ApolloServer({
  typeDefs,
  resolvers
  //context: { modelEmployee } //TODO зачем это?
});

//start server
server
  .listen({ host: configuration.server.host, port: configuration.server.port })
  .then(({ url }) => {
    console.log(`Ready for GraphQL-queries on ${url}`);
  });
