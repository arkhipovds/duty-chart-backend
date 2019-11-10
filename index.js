//Include external modules
const { ApolloServer, gql } = require("apollo-server");
const mongoose = require("mongoose");

//server's parameters
const parameters = new Object({
  DBHost: "10.76.70.51",
  DBPort: "27017",
  DBName: "test"
});

parameters.host = process.argv[2] ? process.argv[2] : "localhost";
parameters.port = process.argv[3] ? process.argv[3] : "4000";

//Determine structure for employees
const employeeSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },
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
  employeeId: String
});

//Compile model with schema "employeeSchema" and collection name "Employees"
const modelEmployee = mongoose.model("Employees", employeeSchema);
//Compile model with schema "shiftSchema" and collection name "Shifts"
const modelShift = mongoose.model("Shifts", shiftSchema);

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
    isRegular: Boolean
    visibleColor: String
    isActive: Boolean
  }
  type Shift {
    id: String
    start: String
    end: String
    employeeId: String
  }
  type Query {
    Employees: [Employee]
    activeEmployees: [Employee]
    Shifts(utPointInMonth: String): [Shift]
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
      isRegular: Boolean
      visibleColor: String
    ): Employee!
    updateEmployee(
      id: String
      fullName: String
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
    Shifts: async (_, { utPointInMonth }, { Shift }) => {
      //Задаем отклонение от указанного времени 40 суток
      const delta = 3456000000;
      console.log(msToDateString(utPointInMonth));
      console.log(utPointInMonth);
      const days = await modelShift.find({
        start: { $gte: utPointInMonth - delta, $lte: utPointInMonth + delta }
      });
      return days;
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
      return shift;
    },
    deleteShift: async (_, { id }, { Shift }) => {
      shift = await modelShift.findOneAndRemove({ _id: id });
      return shift ? true : false;
    },

    addEmployee: async (
      _,
      { fullName, isRegular, visibleColor },
      { Employee }
    ) => {
      const newEmployee = await new modelEmployee({
        fullName,
        isRegular,
        visibleColor
      }).save();
      return newEmployee;
    },
    updateEmployee: async (
      _,
      { id, fullName, isRegular, visibleColor },
      { Employee }
    ) => {
      let employee = await modelEmployee.findOneAndUpdate(
        { _id: id },
        {
          fullName: fullName,
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

//Преобразовывает UNIX-time (в мс) в строку в формате "YYYY-MM-DD HH:MM"
function msToDateString(ms) {
  const tempDate = new Date(Number.parseInt(ms));
  const tempString =
    tempDate.toISOString().slice(0, 10) +
    " " +
    tempDate.toISOString().slice(11, 16);
  return tempString;
}
