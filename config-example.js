//rename it to "config.js" and put it to src

const configuration = {
  mongodb: {
    DBHost: "localhost",
    DBPort: "27017",
    DBName: "test"
  },
  server: {
    host: "localhost",
    port: "4000"
  },
  maxAckTime: 60 * 10, 
  shiftsOffset: 60 * 60 * 24 * 40 
};