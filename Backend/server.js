require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const { Server } = require('socket.io');




const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const registerSocketHandlers = require('./sockets');
const { startSimulator } = require('./services/simulator');


const meterRoutes = require('./routes/meterRoutes');
const readingRoutes = require('./routes/readingRoutes');
const feederRoutes = require('./routes/feederRoutes');
const anomalyRoutes = require('./routes/anomalyRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');



const app = express();
const server = http.createServer(app);


app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));



if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));


app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/meters', meterRoutes);
app.use('/api/readings', readingRoutes);
app.use('/api/feeders', feederRoutes);
app.use('/api/anomalies', anomalyRoutes);
app.use('/api/analytics', analyticsRoutes);


app.use(notFound);
app.use(errorHandler);


const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
});
app.set('io', io);
registerSocketHandlers(io);




const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(` GRIDPULSE API on port ${PORT} (${process.env.NODE_ENV || 'dev'})`);

  });
})();