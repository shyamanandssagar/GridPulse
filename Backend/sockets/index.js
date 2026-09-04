

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
