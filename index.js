//Include external modules
const { ApolloServer, gql } = require("apollo-server");
const mongoose = require("mongoose");

/* 
//TODO вернуться к работе с форматом Date

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
*/

//DB server's parameters                 !!!!!!!!!!!!!!!!!!!!!!!!!!TODO заюзать это в коде
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
  isActive: {
    type: Boolean,
    default: true
  }
  
});

//Determine structure for shifts              !!!!!!!!!!!! employeeId нужно перевести на тип "type: Schema.Types.ObjectId, ref: 'Employee'""
const shiftSchema = new mongoose.Schema({
  start: String,
  end: String,
  employeeId: String,
  test: Date
});

//Compile models with schema "employeeSchema" and collection name "Employees"
const modelEmployee = mongoose.model("Employees", employeeSchema);
//Compile models with schema "shiftSchema" and collection name "Shifts"
const modelShift = mongoose.model("Shifts", shiftSchema);

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
    start: String
    """ When shift ends """
    end: String
    """ Id of employee who is responsible for the shift"""
    employeeId: String
    test: Date
  }
  type Query {
    Employees: [Employee]
    activeEmployees: [Employee]
    Shifts: [Shift]
    shiftsForMonth (month:String): [Shift]
  }
  type Mutation {
    addShift(start:String, end:String, employeeId:String): Shift!
    updateShift(id:String, start:String, end:String, employeeId:String): Shift!
    deleteShift(id:String): Boolean!

    addEmployee(fullName:String, isRegular:Boolean, visibleColor:String): Employee!
    updateEmployee(id:String, fullName:String, isRegular:Boolean, visibleColor:String): Employee!
    deleteEmployee(id:String): Boolean!
  }
`;

//resolvers for graphql
const resolvers = {
  Query: {
    Employees: async (_, args, { Employee }) => {
      const employees = await modelEmployee.find();
      console.log(employees);
	    return employees;
    },
    activeEmployees: async (_, args, { Employee }) => {
      const employees = await modelEmployee.find({ isActive:true});
      console.log(employees);
	    return employees;
    },
    //TODO отдавать смены за период, а не все
    Shifts: async (_, args, { Shift }) => {
	    const days = await modelShift.find({});
    	return days;
    },
    shiftsForMonth: async (_, {month}, { Shift }) => {
	    const days = await modelShift.find({});
    	return days;
    },
  },
  Mutation: {
    addShift: async (_, { start, end, employeeId }, { Shift }) => {
      const newShift = await new modelShift({
        start,
        end,
        employeeId
      }).save();
      return newShift;
    },
    updateShift: async (_, { id, start, end, employeeId }, { Shift }) => {
      let shift = await modelShift.findOneAndUpdate(
        {_id:id}, 
        {
          start:start, 
          end:end, 
          employeeId:employeeId
        },
        {new: true}
      );
      return shift;
    },
    deleteShift: async (_, { id }, { Shift }) => {
      shift = await modelShift.findOneAndRemove({ _id:id });
      return shift ? true : false;
    },

    addEmployee: async (_, { fullName, isRegular, visibleColor }, { Employee }) => {
      const newEmployee = await new modelEmployee({
        fullName,
        isRegular,
        visibleColor
      }).save();
      return newEmployee;
    },
    updateEmployee: async (_, { id, fullName, isRegular, visibleColor }, { Employee }) => {
      let employee = await modelEmployee.findOneAndUpdate(
        {_id:id}, 
        {
          fullName:fullName, 
          isRegular:isRegular, 
          visibleColor:visibleColor
        },
        {new: true}
      );
      return employee;
    },
    deleteEmployee: async (_, { id }, { Employee }) => {
      let employee = await modelEmployee.findOneAndUpdate(
        {_id:id}, 
        {
          isActive:false
        },
        {new: true}
      );
      return employee ? true : false;
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