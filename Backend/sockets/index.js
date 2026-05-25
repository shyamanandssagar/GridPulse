// Socket.IO event registration.
//
// Clients can join per-meter rooms to receive only readings for the meters
// they care about. The dashboard listens to the global 'grid:tick' event for
// aggregated stats — much cheaper than streaming every reading to every client.
//
// Events emitted by server:
//   reading           (room: meter:<id>)  — latest reading for one meter
//   grid:tick         (broadcast)         — aggregated grid stats per tick
//   anomaly:new       (broadcast)         — newly detected anomalies
//   feeder:fault      (broadcast)         — feeder went down
//   feeder:restored   (broadcast)         — feeder came back up
//
// Events from client:
//   meter:subscribe   { meterId }         — join a meter room
//   meter:unsubscribe { meterId }         — leave it

module.exports = function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    socket.on('meter:subscribe', ({ meterId }) => {
      if (!meterId) return;
      socket.join(`meter:${meterId}`);
    });

    socket.on('meter:unsubscribe', ({ meterId }) => {
      if (!meterId) return;
      socket.leave(`meter:${meterId}`);
    });

    socket.on('disconnect', () => {
      // No persistent state per socket; nothing to clean up.
    });
  });
};
