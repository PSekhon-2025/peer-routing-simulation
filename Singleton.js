const crypto = require("crypto"); // Required for hashing

let sequenceNumber;
let timer;
const timerInterval = 5; // Changed from 10ms to 5ms as per assignment requirements

function timerRun() {
  timer++;
  if (timer >= 0xffffffff) {
    // 32-bit overflow prevention: Reset timer if overflow is reached.
    timer = Math.floor(1000 * Math.random());
  }
}

module.exports = {
  // Initializes sequenceNumber and timer.
  init: function () {
    timer = Math.floor(1000 * Math.random()); // Random start for timer
    setInterval(timerRun, timerInterval); // Timer increments every 5ms
    sequenceNumber = Math.floor(1000 * Math.random()); // Random start for sequence
  },

  // Returns the next sequence number.
  getSequenceNumber: function () {
    return ++sequenceNumber;
  },

  // Returns the current timer value.
  getTimestamp: function () {
    return timer;
  },

  // Generates a 16-bit (2-byte) hash-based Peer ID.
  getPeerID: function (IP, port) {
    const input = `${IP}:${port}`;
    const hash = crypto.createHash("blake2s256").update(input).digest("hex");
    return hash.slice(0, 4); // Use first 4 hex characters (16 bits)
  },

  // Converts a Hex string into a binary string.
  Hex2Bin: function (hex) {
    return hex
      .split("")
      .map((str) => parseInt(str, 16).toString(2).padStart(4, "0"))
      .join("");
  },

  // Computes the XOR of two binary strings.
  XORing: function (a, b) {
    let ans = "";
    for (let i = 0; i < a.length; i++) {
      ans += a[i] === b[i] ? "0" : "1";
    }
    return ans;
  },
};
