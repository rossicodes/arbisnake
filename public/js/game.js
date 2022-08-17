var config = {
  type: Phaser.AUTO,
  scale: {
    parent: 'phaser-example',
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { y: 0 }
    }
  },
  dom: {
    createContainer: true
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

var game = new Phaser.Game(config);

var SPACING = 30;
var ROTATION_SPEED = 1.5 * Math.PI;
var ROTATION_SPEED_DEGREES = Phaser.Math.RadToDeg(ROTATION_SPEED);
var TOLERANCE = 0.05 * ROTATION_SPEED;
var PLAYER_SIZE = 20;
var NOM_SIZE = 10;
var WORLD_SIZE = 3500;
var MAX_NICKNAME_SIZE = 20;
var NORMAL_SPEED = 5;
var BOOST_SPEED = 15;
var BOOST_TIME = 50;

function preload() {
  this.load.image('background', 'assets/background.jpg');
  this.load.html('nameform', 'assets/nameform.html');
}

function create() {
  background = this.add.tileSprite(0, 0, WORLD_SIZE, WORLD_SIZE, 'background').setOrigin(0.5, 0.5);
  this.cameras.main.centerOn(0, 0);
  
  var self = this;
  this.socket = io();
  this.otherPlayers = this.physics.add.group();
  this.noms = this.physics.add.group();
  this.nodes = [];
  this.path = [];
  this.playerScoreText = this.add.text(16, 16, 'Your Length: ' + this.nodes.length, { fontSize: '20px', fill: '#FFFFFF' }).setScrollFactor(0).setVisible(false);
  this.playerScoreText.depth = 1;
  this.leaderboardText = this.add.text(this.scale.width, 0, '', { fontSize: '20px', fill: '#FFFFFF' }).setScrollFactor(0).setOrigin(1, 0);
  this.leaderboardText.depth = 1;
  this.textInput = this.add.dom(this.scale.width / 2, this.scale.height / 2).createFromCache('nameform').setScrollFactor(0);
  this.textInput.depth = 1;
  this.warningText = this.add.text(this.scale.width / 2, this.scale.height / 2 + 50, '', { fontSize: '20px', fill: '#FFFFFF' }).setScrollFactor(0).setOrigin(0.5);
  this.warningText.depth = 1;
  this.titleText = this.add.text(this.scale.width / 2, this.scale.height / 2 - 100, 'Arbi Snake', { fontSize: '100px', fill: '#FFFFFF' }).setScrollFactor(0).setOrigin(0.5);
  this.titleText.depth = 1;
  this.gameOverText = this.add.text(this.scale.width / 2, this.scale.height / 2, 'OOF Game Over', { fontSize: '100px', fill: '#FFFFFF' }).setScrollFactor(0).setOrigin(0.5).setVisible(false);
  this.gameOverText.depth = 1;
  this.otherNicknames = {};
  this.boostMeter = BOOST_TIME;
  this.boosting = false;
  this.physics.world.setBounds(-WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE);
  
  this.textInput.addListener('click');
  this.textInput.on('click', (event) => {
    if (event.target.name === 'playButton') {
      var inputText = this.textInput.getChildByName('nameField');
      
      if (inputText.value == '') {
        this.warningText.setText('Please enter a nickname');
      } else {
        this.textInput.removeListener('click');
        this.textInput.setVisible(false);
        this.playerScoreText.setVisible(true);
        this.warningText.setVisible(false);
        this.titleText.setVisible(false);
        this.socket.emit('login', inputText.value);
      }
    }
  });
  
  this.socket.on('loggedIn', () => {
    this.socket.on('currentPlayers', (players) => {
      Object.keys(players).forEach((id) => {
        if (players[id].playerId === self.socket.id) {
          addPlayer(self, players[id]);
        } else {
          if (players[id].alive) addOtherPlayers(self, players[id]);
        }
      });

      this.physics.add.collider(this.nodes[0], this.otherPlayers, () => {
        gameOver(this);
      });

      this.nodes[0].body.setCollideWorldBounds(true);
      this.nodes[0].body.onWorldBounds = true;
      this.physics.world.on('worldbounds', (body) => {
        if (!this.dead) {
          this.dead = true;
          gameOver(this);
        }
      }, this);

      this.playerScoreText.setText('Your Length: ' + self.nodes.length);
    });
  
    this.socket.on('newPlayer', (playerInfo) => {
      addOtherPlayers(self, playerInfo);
    });
  
    this.socket.on('unconnect', (playerId) => {
      for (var i = 0; i < self.otherPlayers.getChildren().length; i++) {
        if (playerId === self.otherPlayers.getChildren()[i].playerId) {
          self.otherPlayers.getChildren()[i].destroy();
          i--;
        }
      }
      if (self.otherNicknames[playerId]) self.otherNicknames[playerId].setVisible(false);
    });
  
    this.socket.on('playerMoved', function (playerInfo) {
      self.otherPlayers.getChildren().forEach((otherPlayer) => {
        if (playerInfo.playerId === otherPlayer.playerId) {
          if (!playerInfo.nodes[otherPlayer.nodeId]) {
            otherPlayer.destroy();
          } else {
            otherPlayer.setPosition(playerInfo.nodes[otherPlayer.nodeId].x, playerInfo.nodes[otherPlayer.nodeId].y);
            otherPlayer.setRotation(playerInfo.nodes[otherPlayer.nodeId].rotation);
          }
        }
      });
      if (self.otherNicknames[playerInfo.playerId]) self.otherNicknames[playerInfo.playerId].setPosition(playerInfo.nodes[0].x, playerInfo.nodes[0].y + PLAYER_SIZE * 3);
    });
  
    this.socket.on('scoreUpdate', (leaderboard) => {
      var newText = 'Leaderboard\n\n';
      var place = 0;
      for (var i = 0; i < 10; i++) {
        if (leaderboard[i]) {
          if (!leaderboard[i - 1] || leaderboard[i].score < leaderboard[i - 1].score) place++;
          newText += '#' + place + ' ' + leaderboard[i].nickname.padEnd(MAX_NICKNAME_SIZE, ' ') + ' ' + String(leaderboard[i].score).padEnd(3, ' ') + '\n';
        } else {
          place++;
          newText += '#' + place + ' '.padEnd(MAX_NICKNAME_SIZE, ' ') + ' ' + ' '.padEnd(3, ' ') + '\n';
        }
      }
      self.leaderboardText.setText(newText);
    });
  
    this.socket.on('playerGrowed', (playerInfo) => {
      growOtherPlayer(self, playerInfo);
    });
    
    this.socket.on('nomCollection', (nomPos) => {
      for (var i = 0; i < self.noms.getChildren().length; i++) {
        if (nomPos.x === self.noms.getChildren()[i].x && nomPos.y === self.noms.getChildren()[i].y) {
          self.noms.getChildren()[i].destroy();
          i--;
        }
      }
    });
    
    this.socket.on('nomLocations', (noms) => {
      for (var i = 0; i < noms.length; i++) {
        var nom = self.add.circle(noms[i].x, noms[i].y, NOM_SIZE, Phaser.Display.Color.GetColor(255, 255, 255));
        self.physics.add.existing(nom);
        nom.body.setCircle(NOM_SIZE);
        self.noms.add(nom);
      }
      this.physics.add.collider(this.nodes[0], this.noms, (node, nom) => {
        growPlayer(self);
        var nomPos = { x: nom.x, y: nom.y };
        this.socket.emit('nomCollected', nomPos);
        this.socket.emit('playerGrow', { x: this.nodes[this.nodes.length - 1].x, y: this.nodes[this.nodes.length - 1].y });
        nom.destroy();
      });
    });
    
    this.socket.on('nomsReleased', (nomsReleased) => {
      for (var i = 0; i < nomsReleased.length; i++) {
        var nom = self.add.circle(nomsReleased[i].x, nomsReleased[i].y, NOM_SIZE, Phaser.Display.Color.GetColor(255, 255, 255));
        self.physics.add.existing(nom);
        nom.body.setCircle(NOM_SIZE);
        self.noms.add(nom);
      }
    });
    
    this.input.on('pointerdown', function (pointer) {
      this.boosting = true;
    }, this);
    
    this.input.on('pointerup', function (pointer) {
      this.boosting = false;
    }, this);
  });
}

function update(time, delta) {
  if (this.boosting && !this.dead) {
    this.speed = BOOST_SPEED;
    this.boostMeter--;
    if (this.boostMeter <= 0) {
      if (this.nodes.length > 6) {
        this.nodes[this.nodes.length - 1].setVisible(false);
        this.socket.emit('playerBoost', [{ x: this.nodes[this.nodes.length - 1].x, y: this.nodes[this.nodes.length - 1].y }]);
        this.nodes.pop();
        this.playerScoreText.setText('Your Length: ' + this.nodes.length);
      }
      this.boostMeter = BOOST_TIME;
    }
  } else {
    this.speed = NORMAL_SPEED;
  }

  if (this.nodes.length > 0) {
    this.nicknameText.setPosition(this.nodes[0].x, this.nodes[0].y + PLAYER_SIZE * 3);

    this.input.activePointer.updateWorldPoint(this.cameras.main);
    var angleToPointer = Phaser.Math.Angle.Between(this.nodes[0].x, this.nodes[0].y, this.input.activePointer.worldX, this.input.activePointer.worldY);
    var angleDelta = Phaser.Math.Angle.Wrap(angleToPointer - this.nodes[0].rotation);
    
    if (Phaser.Math.Within(angleDelta, 0, TOLERANCE)) {
      this.nodes[0].rotation = angleToPointer;
      this.nodes[0].body.setAngularVelocity(0);
    } else {
      this.nodes[0].body.setAngularVelocity(Math.sign(angleDelta) * ROTATION_SPEED_DEGREES);
    }
    
    var xDir = Math.cos(this.nodes[0].rotation);
    var yDir = Math.sin(this.nodes[0].rotation);

    var deltaAdjust = (delta / (1000 / 60));
    
    for (var i = 0; i < this.speed * deltaAdjust; i++) {
      var part = this.path.pop();
      part.x = this.path[0].x + xDir;
      part.y = this.path[0].y + yDir;
      this.path.unshift(part);
    }

    for (var i = 0; i < this.nodes.length; i++) {
      this.nodes[i].x = this.path[i * SPACING].x;
      this.nodes[i].y = this.path[i * SPACING].y;
    }

    this.socket.emit('playerMovement', { nodes: this.nodes });
  }
}

function addPlayer(self, playerInfo) {
  for (var i = 0; i < playerInfo.nodes.length; i++) {
    if (i == 0) {
      self.nodes[i] = self.add.container(playerInfo.nodes[i].x, playerInfo.nodes[i].y);
      self.nodes[i].add(self.add.circle(0, 0, PLAYER_SIZE, Phaser.Display.Color.HexStringToColor(playerInfo.color).color));
      self.nodes[i].add(self.add.circle(PLAYER_SIZE, -PLAYER_SIZE / 2, PLAYER_SIZE / 2, Phaser.Display.Color.HexStringToColor('#FFFFFF').color).setOrigin(1, 0.5));
      self.nodes[i].add(self.add.circle(PLAYER_SIZE, PLAYER_SIZE / 2, PLAYER_SIZE / 2, Phaser.Display.Color.HexStringToColor('#FFFFFF').color).setOrigin(1, 0.5));
      self.nodes[i].add(self.add.circle(PLAYER_SIZE, -PLAYER_SIZE / 2, PLAYER_SIZE / 3, Phaser.Display.Color.HexStringToColor('#000000').color).setOrigin(1, 0.5));
      self.nodes[i].add(self.add.circle(PLAYER_SIZE, PLAYER_SIZE / 2, PLAYER_SIZE / 3, Phaser.Display.Color.HexStringToColor('#000000').color).setOrigin(1, 0.5));
      self.physics.add.existing(self.nodes[i]);
      self.nodes[i].body.setCircle(PLAYER_SIZE, -PLAYER_SIZE, -PLAYER_SIZE);
      self.nodes[i].setInteractive(new Phaser.Geom.Circle(0, 0, PLAYER_SIZE), Phaser.Geom.Circle.Contains);
    } else {
      self.nodes[i] = self.add.circle(playerInfo.nodes[i].x, playerInfo.nodes[i].y, PLAYER_SIZE, Phaser.Display.Color.HexStringToColor(playerInfo.color).color);
    }
  };

  self.cameras.main.startFollow(self.nodes[0]);
  self.nicknameText = self.add.text(0, 0, playerInfo.nickname, { fontSize: '20px', fill: '#FFFFFF' }).setOrigin(0.5);

  for (var i = 0; i <= playerInfo.nodes.length * SPACING; i++) {
    self.path[i] = { x: playerInfo.nodes[0].x - i, y: playerInfo.nodes[0].y };
  }
}

function addOtherPlayers(self, playerInfo) {
  for (var i = 0; i < playerInfo.nodes.length; i++) {
    if (i == 0) {
      var otherPlayer = self.add.container(playerInfo.nodes[i].x, playerInfo.nodes[i].y);
      otherPlayer.add(self.add.circle(0, 0, PLAYER_SIZE, Phaser.Display.Color.HexStringToColor(playerInfo.color).color));
      otherPlayer.add(self.add.circle(PLAYER_SIZE, -PLAYER_SIZE / 2, PLAYER_SIZE / 2, Phaser.Display.Color.HexStringToColor('#FFFFFF').color).setOrigin(1, 0.5));
      otherPlayer.add(self.add.circle(PLAYER_SIZE, PLAYER_SIZE / 2, PLAYER_SIZE / 2, Phaser.Display.Color.HexStringToColor('#FFFFFF').color).setOrigin(1, 0.5));
      otherPlayer.add(self.add.circle(PLAYER_SIZE, -PLAYER_SIZE / 2, PLAYER_SIZE / 3, Phaser.Display.Color.HexStringToColor('#000000').color).setOrigin(1, 0.5));
      otherPlayer.add(self.add.circle(PLAYER_SIZE, PLAYER_SIZE / 2, PLAYER_SIZE / 3, Phaser.Display.Color.HexStringToColor('#000000').color).setOrigin(1, 0.5));
      self.physics.add.existing(otherPlayer);
      otherPlayer.body.setCircle(PLAYER_SIZE, -PLAYER_SIZE, -PLAYER_SIZE);
      otherPlayer.setInteractive(new Phaser.Geom.Circle(0, 0, PLAYER_SIZE), Phaser.Geom.Circle.Contains);
      otherPlayer.playerId = playerInfo.playerId;
      otherPlayer.nodeId = i;
      self.otherPlayers.add(otherPlayer);
    } else {
      var otherPlayer = self.add.circle(playerInfo.nodes[i].x, playerInfo.nodes[i].y, PLAYER_SIZE, Phaser.Display.Color.HexStringToColor(playerInfo.color).color);
      self.physics.add.existing(otherPlayer);
      otherPlayer.body.setCircle(PLAYER_SIZE);
      otherPlayer.playerId = playerInfo.playerId;
      otherPlayer.nodeId = i;
      self.otherPlayers.add(otherPlayer);
    }
  }
  self.otherNicknames[playerInfo.playerId] = self.add.text(0, 0, playerInfo.nickname, { fontSize: '20px', fill: '#FFFFFF' }).setOrigin(0.5);
}

function gameOver(self) {
  self.dead = true;
  self.cameras.main.stopFollow();
  for (var i = 0; i <self.nodes.length; i++) {
    self.nodes[i].setVisible(false);
  }
  self.nicknameText.setVisible(false);
  self.gameOverText.setVisible(true);
  self.nodes[0].body.checkCollision.none = true;
  self.nodes[0].body.setCollideWorldBounds(false);
  self.nodes[0].body.onWorldBounds = false;
  self.nodes[0].body.destroy();
  self.socket.emit('playerDead')
}

function growPlayer(self) {
  self.nodes.push(self.add.circle(self.nodes[self.nodes.length - 1].x, self.nodes[self.nodes.length - 1].y, PLAYER_SIZE, self.nodes[self.nodes.length - 1].fillColor));
  for (var i = 0; i < SPACING; i++) {
    self.path.push({ x: self.nodes[self.nodes.length - 1].x - i, y: self.nodes[self.nodes.length - 1].y });
  }
  self.playerScoreText.setText('Your Length: ' + self.nodes.length);
}

function growOtherPlayer(self, playerInfo) {
  var otherNode = self.add.circle(playerInfo.nodes[playerInfo.nodes.length - 1].x, playerInfo.nodes[playerInfo.nodes.length - 1].y, PLAYER_SIZE, Phaser.Display.Color.HexStringToColor(playerInfo.color).color);
  self.physics.add.existing(otherNode);
  otherNode.body.setCircle(PLAYER_SIZE);
  otherNode.playerId = playerInfo.playerId;
  otherNode.nodeId = playerInfo.nodes.length - 1;
  self.otherPlayers.add(otherNode);
}