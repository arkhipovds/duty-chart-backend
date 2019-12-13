//Include external modules
const { ApolloServer, gql } = require("apollo-server");
const mongoose = require("mongoose");

//server's parameters
const parameters = new Object({
  DBHost: "10.76.70.51",
  DBPort: "27017",
  DBName: "test"
});

//Макс. время реакции
var maxAckTime = 1000 * 60 * 10;

parameters.host = process.argv[2] ? process.argv[2] : "localhost";
parameters.port = process.argv[3] ? process.argv[3] : "4000";

//Determine structure for employees
const employeeSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },
  ADLogin: String,
  isRegular: Boolean,
  visibleColor: String,
  isActive: {
    type: Boolean,
    default: true
  }
});
//Determine structure for shifts              !!!!!!!!!!!! TODO: employeeId нужно перевести на тип "type: Schema.Types.ObjectId, ref: 'Employee'""
const shiftSchema = new mongoose.Schema({
  start: Number,
  end: Number,
  employeeId: String,
  //События, подтвержденные вовремя
  ackInTimeEventsCount: Number,
  //События, подтвержденные невовремя
  ackNotInTimeEventsCount: Number,
  //Не подтвержденные события
  noAckEventsCount: Number,
  //Слишком короткие события
  tooShortEventsCount: Number,
  //Всего событий за смену
  normalEventsCount: Number
});
//Determine structure for events
const schemaEvent = new mongoose.Schema({
  //Timestamp of event's start
  tsStart: Number,
  //Timestamp of event's ack
  tsAck: Number,
  //Timestamp of event's end
  tsEnd: Number,
  //User login in Active Directory
  ADlogin: String,
  //Event's text
  text: String,
  //Event's host
  host: String,
  //Event's severity
  severity: Number,
  //Duration without check
  freeDuration: Number,
  //Is user forgiven ))
  isForgiven: Boolean
});

//Compile model with schema "employeeSchema" and collection name "Employees"
const modelEmployee = mongoose.model("Employees", employeeSchema);
//Compile model with schema "shiftSchema" and collection name "Shifts"
const modelShift = mongoose.model("Shifts", shiftSchema);
//Compile model with schema "schemaEvent" and collection name "Events"
const modelEvent = mongoose.model("Events", schemaEvent);

//connect to mongodb-server
mongoose
  .connect(
    "mongodb://" +
      parameters.DBHost +
      ":" +
      parameters.DBPort +
      "/" +
      parameters.DBName +
      "?retryWrites=true&w=majority",
    {
      useNewUrlParser: true,
      useFindAndModify: false
    }
  )
  .then(() => console.log('Connected to DB "' + parameters.DBName + '"'))
  .catch(err => console.error(err));

//Declare types and queries for graphql-queries
const typeDefs = gql`
  type Employee {
    id: String
    fullName: String
    ADLogin: String
    isRegular: Boolean
    visibleColor: String
    isActive: Boolean
  }
  type Shift {
    id: String
    start: String
    end: String
    employeeId: String
    ackInTimeEventsCount: String
    ackNotInTimeEventsCount: String
    noAckEventsCount: String
    tooShortEventsCount: String
    normalEventsCount: String
  }
  type Event {
    id: String
    tsStart: String
    tsAck: String
    tsEnd: String
    ADlogin: String
    text: String
    host: String
    severity: String
    freeDuration: String
    isForgiven: Boolean
  }
  type Query {
    Employees: [Employee]
    activeEmployees: [Employee]
    thisMonthEmployeesId: [String]
    Shifts(utPointInMonth: String): [Shift]
    events: [Event]
    maxEventTime: String
  }
  type Mutation {
    addShift(start: String, end: String, employeeId: String): Shift!
    updateShift(
      id: String
      start: String
      end: String
      employeeId: String
    ): Shift!
    deleteShift(id: String): Boolean!

    addEmployee(
      fullName: String
      ADLogin: String
      isRegular: Boolean
      visibleColor: String
    ): Employee!
    updateEmployee(
      id: String
      fullName: String
      ADLogin: String
      isRegular: Boolean
      visibleColor: String
    ): Employee!
    deleteEmployee(id: String): Boolean!
  }
`;

//resolvers for graphql
const resolvers = {
  Query: {
    Employees: async (_, args, { Employee }) => {
      const employees = await modelEmployee.find();
      return employees;
    },
    activeEmployees: async (_, args, { Employee }) => {
      const employees = await modelEmployee.find({ isActive: true });
      return employees;
    },
    thisMonthEmployeesId: async (_, { TS }, { Employee }) => {
      var theDate = new Date(TS);
      
      const days = await modelShift.find();
      return days;
    },
    Shifts: async (_, { utPointInMonth }, { Shift }) => {
      //Задаем отклонение от указанного времени 40 суток
      const delta = 3456000000;
      const days = await modelShift.find({
        start: { $gte: utPointInMonth - delta, $lte: utPointInMonth + delta }
      });
      return days;
    },
    events: async (_, args, { Event }) => {
      const events = await modelEvent.find();
      return events;
    },
    maxEventTime: async (_, args, { Event }) => {
      const maxTS = await modelEvent
        .find()
        .sort("-tsStart")
        .limit(1);
      return maxTS[0].tsStart;
    }
  },
  Mutation: {
    //TODO запретить смены длиннее 48 часов и отрицательные смены
    addShift: async (_, { start, end, employeeId }, { Shift }) => {
      const newShift = await new modelShift({
        start,
        end,
        employeeId
      }).save();
      calculateIndicatorsForShift(newShift._id);
      return newShift;
    },
    //TODO запретить смены длиннее 48 часов и отрицательные смены
    updateShift: async (_, { id, start, end, employeeId }, { Shift }) => {
      let shift = await modelShift.findOneAndUpdate(
        { _id: id },
        {
          start: start,
          end: end,
          employeeId: employeeId
        },
        { new: true }
      );
      calculateIndicatorsForShift(shift._id);
      return shift;
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
    }
  }
};
//create new Apollo server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: { modelEmployee }
});
//start it
server
  .listen({ host: parameters.host, port: parameters.port })
  .then(({ url }) => {
    console.log(`Ready for GraphQL-queries on ${url}`);
  });
//
async function calculateIndicatorsForShift(shiftId) {
  var tempArray = await modelShift.find({ _id: shiftId }).limit(1);
  const tempShift = tempArray[0];

  var tempArray = await modelEvent
    .find({ tsStart: { $gte: tempShift.end } })
    .sort("tsStart")
    .limit(1);

  if (tempArray.length > 0) {
    tempArray = await modelEvent
      .find({ tsStart: { $gte: tempShift.start, $lte: tempShift.end } })
      .sort("tsStart");
    console.log("Событий за смену " + tempArray.length);
    var ackInTimeEventsCount = 0;
    var ackNotInTimeEventsCount = 0;
    var tooShortEventsCount = 0;
    var noAckEventsCount = 0;
    for (i in tempArray) {
      if (tempArray[i].tsAck > 0) {
        if (tempArray[i].freeDuration <= maxAckTime) {
          ackInTimeEventsCount++;
        } else {
          ackNotInTimeEventsCount++;
        }
      } else {
        if (tempArray[i].freeDuration <= maxAckTime) {
          tooShortEventsCount++;
        } else {
          noAckEventsCount++;
        }
      }
    }
    await modelShift.findOneAndUpdate(
      { _id: shiftId },
      {
        ackInTimeEventsCount: ackInTimeEventsCount,
        ackNotInTimeEventsCount: ackNotInTimeEventsCount,
        noAckEventsCount: noAckEventsCount,
        tooShortEventsCount: tooShortEventsCount,
        normalEventsCount: tempArray.length - tooShortEventsCount
      }
    );
  }
}
