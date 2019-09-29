//Include external modules
const { ApolloServer, gql } = require("apollo-server");
const mongoose = require("mongoose");
const { GraphQLScalarType } = require("graphql");
const { Kind } = require("graphql/language");

//Determine type Date for GraphQL
const resolverMap = {
  Date: new GraphQLScalarType({
    name: 'Date',
    description: 'Date custom scalar type',
    parseValue(value) {
      return new Date(value); // value from the client
    },
    serialize(value) {
      return value.getTime(); // value sent to the client
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        return new Date(ast.value) // ast value is always in string format
      }
      return null;
    },
  }),
};

//DB server's parameters
const DBServer = new Object({
  host: '10.76.70.51',
  port: '27017',
  DB: 'test'
})

//Determine structure for employees
const employeeSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },
  isRegular: Boolean,
  visibleColor: String,
  isActive: Boolean
});

//Determine structure for shifts              !!!!!!!!!!!! employeeId нужно перевести на тип "type: Schema.Types.ObjectId, ref: 'Employee'""
const shiftSchema = new mongoose.Schema({
  start: Date,
  end: Date,
  employeeId: String
});

//Determine structure for duty chart
const DutyChartSchema = new mongoose.Schema({
  day: Number,
  month: Number,
  year: Number,
  isWeekday: Boolean,
  dayDutyEmployeeId: String,
  nightDutyEmployeeId: String
});

//Compile models with schema "employeeSchema" and collection name "Employees"
const modelEmployee = mongoose.model("Employees", employeeSchema);
//Compile models with schema "shiftSchema" and collection name "Shifts"
const modelShift = mongoose.model("Shifts", shiftSchema);
//
const modelDutyChart = mongoose.model("DutyCharts", DutyChartSchema);

//connect to mongodb-server 10.76.70.51 on port 27017 to DB "test"         !!!!!!!!!!!!вынести все в параметры
mongoose
  .connect(
    "mongodb://10.76.70.51:27017/test?retryWrites=true&w=majority",
    { useNewUrlParser: true, useFindAndModify: false }
  )
  .then(() => console.log("База взлетела!"))                    // !!!!!!!!!!!!сделать лог информативнее
  .catch(err => console.error(err));

//Declare types for graphql-queries
const typeDefs = gql`
  scalar Date
  type Employee {
    id: String
    """ Last name """
    fullName: String
    """ Is regular employee? """
    isRegular: Boolean
    """ Цвет отображения """
    visibleColor: String
    """ Is not fired """
    isActive: Boolean
  }
  type Shift {
    id: String
    """ When shift starts """
    start: Date
    """ When shift ends """
    end: Date
    """ Id of employee who is responsible for the shift"""
    employeeId: String
  }
  type Day {
    id: String
    day: Int!
    month: Int!
    year: Int!
    isWeekday: Boolean
    dayDutyEmployeeId: String
    nightDutyEmployeeId: String
  }
  type Query {
    getEmployees: [Employee]
    getShifts: [Shift]
    getAllDays: [Day]
    getMonth(number: Int): [Day]
  }
  type Mutation {
    addEmployee(fullName:String, isRegular:Boolean): Employee!
    addShift(start:Date, end:Date, employeeId:String): Shift!
    deleteEmployee(id:String): Employee!
  }
`;

//resolvers for graphql
const resolvers = {
  Query: {
    getEmployees: async (_, args, { Employee }) => {
      const employees = await modelEmployee.find({});
      console.log(employees);
	    return employees;
    },
    getAllDays: async (_, args, { Day }) => {
	    const days = await modelDutyChart.find({});
    	return days;
    },
    getShifts: async (_, args, { Shift }) => {
	    const days = await modelShift.find({});
    	return days;
    },
    getMonth: async (_, number, { Day }) => {
	    var days = [];
	    days = await modelDutyChart.find({
	      month:number.number
	    });
	    return days;
    }
  },
  Mutation: {
    addEmployee: async (_, { fullName, isRegular }, { Employee }) => {
      const newEmployee = await new modelEmployee({
        fullName,
        isRegular
      }).save();
      return newEmployee;
    },
    addShift: async (_, { start, end, employeeId }, { Shift }) => {
      const newShift = await new modelShift({
        start,
        end,
        employeeId
      }).save();
      return newShift;
    },
    deleteEmployee: async (_, { id }, { Employee }) => {
      await Employee.findOneAndRemove({ _id:id });
      return await Employee.find({});
    },
  }
};

//create new Apollo server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: { modelEmployee }
});

//start it
const HOST = process.argv[2];  //!!!!!!!!!дефолтное значение задать
const PORT = process.argv[3];  //!!!!!!!!!дефолтное значение задать
server.listen({ host: HOST, port: PORT }).then(({ url }) => {
  console.log(`Взлетел ${url}`);
});