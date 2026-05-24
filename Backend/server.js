require('dotenv').config();
const express = require('express');
const http = require('http');

const morgan = require('morgan');
const { Server } = require('socket.io');




const connectDB = require('./config/db');




const app = express();
const server = http.createServer(app);



app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));



if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));



const io = new Server(server);


app.set('io', io);





const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(` Smart Grid API on port ${PORT} (${process.env.NODE_ENV || 'dev'})`);

  });
})();