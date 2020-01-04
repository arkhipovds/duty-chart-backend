const mongoose = require("mongoose");

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

module.exports = employeeSchema;
