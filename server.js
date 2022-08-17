var express = require('express');
const { SocketAddress } = require('net');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var players = {};
var noms = [];
var leaderboard = [];

var INIT_NODES = 6;
var NUM_NOMS = 100;
var WORLD_SIZE = 3500;
var BUFFER = 500;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function leaderboardSort(x, y) {
  return y.score - x.score;
}

function initNoms() {
  noms = [];
  for (var i = 0; i < NUM_NOMS; i++) {
    noms[i] = {
      x: randInt(-WORLD_SIZE / 2 + BUFFER, WORLD_SIZE / 2 - BUFFER),
      y: randInt(-WORLD_SIZE / 2 + BUFFER, WORLD_SIZE / 2 - BUFFER),
    }
  }
}
initNoms();

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function (socket) {
  console.log('a user connected');

  socket.on('login', (nickname) => {
    console.log(nickname + ' logged in');
    socket.emit('loggedIn');

    if (Object.keys(players).length == 0) {
      initNoms();
    }

    players[socket.id] = {
      nodes: [],
      playerId: socket.id,
      nickname: nickname,
      color: Math.floor(Math.random() * 16777215).toString(16),
      alive: true,
    }

    for (var i = 0; i < INIT_NODES; i++) {
      if (i == 0) {
        players[socket.id].nodes[i] = { x: randInt(-WORLD_SIZE / 2 + BUFFER, WORLD_SIZE / 2 - BUFFER), y: randInt(-WORLD_SIZE / 2 + BUFFER, WORLD_SIZE / 2 - BUFFER) };
      } else {
        players[socket.id].nodes[i] = { x: players[socket.id].nodes[i - 1].x, y: players[socket.id].nodes[i - 1].y };
      }
    }

    leaderboard.push({
      playerId: players[socket.id].playerId,
      nickname: players[socket.id].nickname,
      score: players[socket.id].nodes.length,
    })
    leaderboard.sort(leaderboardSort);
    io.emit('scoreUpdate', leaderboard);

    socket.emit('currentPlayers', players);
    socket.emit('nomLocations', noms);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('playerMovement', function (movementData) {
      for (var i = 0; i < players[socket.id].nodes.length; i++) {
        players[socket.id].nodes[i] = movementData.nodes[i];
      }
      socket.broadcast.emit('playerMoved', players[socket.id]);
    });

    socket.on('disconnect', () => {
      console.log('user disconnected');

      var nomsReleased = [];
      for (var i = INIT_NODES; i < players[socket.id].nodes.length; i++) {
        noms.push({ x: players[socket.id].nodes[i].x, y: players[socket.id].nodes[i].y });
        nomsReleased.push({ x: players[socket.id].nodes[i].x, y: players[socket.id].nodes[i].y });
      }
      io.emit('nomsReleased', nomsReleased);

      for (var i = 0; i < leaderboard.length; i++) {
        if (leaderboard[i] && leaderboard[i].playerId == socket.id) {
          delete leaderboard[i];
          i--;
        }
      }
      leaderboard.sort(leaderboardSort);
      io.emit('scoreUpdate', leaderboard);
      io.emit('unconnect', socket.id);

      delete players[socket.id];
    });

    socket.on('playerDead', () => {
      players[socket.id].alive = false;
      var nomsReleased = [];
      for (var i = INIT_NODES; i < players[socket.id].nodes.length; i++) {
        noms.push({ x: players[socket.id].nodes[i].x, y: players[socket.id].nodes[i].y });
        nomsReleased.push({ x: players[socket.id].nodes[i].x, y: players[socket.id].nodes[i].y });
      }
      io.emit('nomsReleased', nomsReleased);

      for (var i = 0; i < leaderboard.length; i++) {
        if (leaderboard[i] && leaderboard[i].playerId == socket.id) {
          delete leaderboard[i];
          i--;
        }
      }
      leaderboard.sort(leaderboardSort);
      io.emit('scoreUpdate', leaderboard);
      io.emit('unconnect', socket.id);
    });

    socket.on('nomCollected', (nomPos) => {
      for (var i = 0; i < noms.length; i++) {
        if (noms[i] && noms[i].x == nomPos.x && noms[i].y == nomPos.y) {
          noms.splice(i, 1);
          i--;
        }
      }
      socket.broadcast.emit('nomCollection', nomPos);
      for (var i = 0; i < leaderboard.length; i++) {
        if (leaderboard[i] && leaderboard[i].playerId == socket.id) leaderboard[i].score++;
      }
      leaderboard.sort(leaderboardSort);
      io.emit('scoreUpdate', leaderboard);
    })

    socket.on('playerGrow', (playerInfo) => {
      players[socket.id].nodes.push({ x: playerInfo.x, y: playerInfo.y });
      socket.broadcast.emit('playerGrowed', players[socket.id]);
    });

    socket.on('playerBoost', (nomsReleased) => {
      players[socket.id].nodes.pop();
      noms.push(nomsReleased[0]);

      for (var i = 0; i < leaderboard.length; i++) {
        if (leaderboard[i] && leaderboard[i].playerId == socket.id) {
          leaderboard[i].score--;
        }
      }
      leaderboard.sort(leaderboardSort);
      io.emit('scoreUpdate', leaderboard);

      io.emit('nomsReleased', nomsReleased);
    });
  })

});

server.listen(process.env.PORT || 8081, function () {
  console.log(`Listening on ${server.address().port}`);
});