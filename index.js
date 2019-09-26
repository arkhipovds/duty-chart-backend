//Include external modules
const { ApolloServer, gql } = require("apollo-server");
const mongoose = require("mongoose");

//Determine structure for employees
const EmployeesSchema = new mongoose.Schema({
  lastName: {
    type: String,
    required: true
  },
  isRegular: Boolean,
  visibleColor: String,
  isActive: Boolean
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

//Compile models with schema "EmployeesSchema" and collection name "Employees"
const modelEmployee = mongoose.model("Employees", EmployeesSchema);
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
  type Query {
    """ Get all employees """
    getEmployees: [Employee]
    getAllDays: [Day]
    getMonth(number: Int): [Day]
  }
  type Employee {
    id: String
    """ Last name """
    lastName: String
    """ Is regular employee? """
    isRegular: Boolean
    """ Цвет отображения """
    visibleColor: String
    """ Is not fired """
    isActive: Boolean
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
  type Mutation {
    addEmployee(lastName:String, isRegular:Boolean): Employee!
    deleteEmployee(id:String): Employee!
    addDay(dayNumber:Int, monthNumber:Int, yearNumber:Int): Day!
  }
`;

//resolvers for graphql
const resolvers = {
  Query: {
    getEmployees: async (_, args, { Employee }) => {
	    const employees = await modelEmployee.find({});
	    return employees;
    },
    getAllDays: async (_, args, { Day }) => {
	    const days = await modelDutyChart.find({});
	    console.log(days);
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
    addEmployee: async (_, { lastName, isRegular }, { Employee }) => {
      const newEmployee = await new modelEmployee({
        lastName,
        isRegular
      }).save();
      return newEmployee;
    },
    deleteEmployee: async (_, { id }, { Employee }) => {
      await Employee.findOneAndRemove({ _id:id });
      return await Employee.find({});
    },
    addDay: async (_, { dayNumber, monthNumber, yearNumber }, { Day }) => {
      const sameDay = await modelDutyChart.findOne({
        day:dayNumber,
        month:monthNumber,
        year:yearNumber
      });
      if(sameDay){
        throw new Error('Day is already exists');
      }
      const newDay = await new modelDutyChart({
        day:dayNumber,
        month:monthNumber,
        year:yearNumber
      }).save();
      return newDay;
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
const HOST = process.argv[2];  //!!!!!!!!!дефолтное значение задать
const PORT = process.argv[3];  //!!!!!!!!!дефолтное значение задать
server.listen({ host: HOST, port: PORT }).then(({ url }) => {
  console.log(`Взлетел ${url}`);
});
