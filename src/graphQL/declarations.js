const { gql } = require("apollo-server");

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
    freeDurationSum: String
  }
  type Scoring {
    id: String
    TS: String
    ackInTimeEventsCount: String
    ackNotInTimeEventsCount: String
    noAckEventsCount: String
    tooShortEventsCount: String
    normalEventsCount: String
    freeDurationSum: String
    employeeId: String
  }
  type Event {
    id: String
    tsStart: String
    tsAck: String
    tsEnd: String
    ADLogin: String
    text: String
    host: String
    severity: String
    freeDuration: String
    ackType: String
    isFinished: Boolean
  }
  type Query {
    employees: [Employee]
    activeEmployees: [Employee]
    scorings(TS: String): [Scoring]
    shifts(TS: String): [Shift]
    events(TS: String, employeeId: String, ackType: String): [Event]
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
    updateScorings(TS: String): String!
  }
`;
module.exports = typeDefs;
