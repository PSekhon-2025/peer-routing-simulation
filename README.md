
````markdown
# 🕸️ Kademlia-Style Distributed Hash Table (DHT) Peer

A lightweight peer-to-peer overlay network implementing a simplified [Kademlia](https://pdos.csail.mit.edu/~petar/papers/maymounkov-kademlia-lncs.pdf) DHT routing algorithm in **Node.js**. Features include XOR-distance-based routing, peer discovery, heartbeat-based liveness detection, and a custom binary messaging protocol.

---

## 🚀 Features

- **16-bit Peer IDs** generated via Blake2s256 hash of `ip:port`
- **XOR-based Routing Table** with 16 buckets (k = 1)
- **Custom Binary Protocol (kPTP)** with HELLO, WELCOME, HEARTBEAT, and HEARTBEAT_RESPONSE messages
- **Heartbeat Scheduler** to monitor peer liveness and evict unreachable nodes
- **Deterministic Peer Bootstrapping** with selfInfo propagation
- **Fully Automated Smoke Tests** to validate DHT behavior under network churn

---

## 🧠 Architecture Overview

```text
       ┌──────────┐         ┌──────────┐
       │   Peer A │◄────┐   │  Peer B  │
       └────┬─────┘     │   └────┬─────┘
            │ HELLO     │        │ HEARTBEAT
            ▼           │        ▼
       ┌────────────────────────────┐
       │   Routing Table (XOR logic)│
       └────────────────────────────┘
````

* Nodes communicate over **raw TCP sockets**
* Each peer maintains a **routing table** of closest known peers
* Messages are encoded in **binary format** and include optional metadata

---

## 📦 Project Structure

```
.
├── DHTPeer.js           # Main entrypoint for peer startup and message handling
├── RoutingTable.js      # Kademlia-style XOR-distance routing logic
├── Heartbeat.js         # Peer liveness monitoring and eviction
├── kPTP.js              # Custom binary protocol encoder/decoder
├── Singleton.js         # Shared utilities (hashing, time, sequence numbers)
├── PeerID.js            # Hash-based peer ID generator
├── test_dht.js          # Automated smoke tests using child processes
```

---

## 🛠️ Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Launch a peer

```bash
node DHTPeer.js -n Peer1
```

### 3. Join an existing network

```bash
node DHTPeer.js -n Peer2 -p <bootstrap_ip>:<port>
```

---

## 🧪 Running Tests

Run the full smoke test suite to validate:

* Peer discovery via HELLO/WELCOME
* Peer eviction after 3 missed heartbeats
* Multiple peers synchronizing via kPTP protocol

```bash
node test_dht.js
```

---

## 📨 kPTP Protocol Specification

| Field              | Size     | Description                         |
| ------------------ | -------- | ----------------------------------- |
| Version            | 1 byte   | Protocol version (currently 1)      |
| Type               | 1 byte   | Message type (HELLO, WELCOME, etc.) |
| Num Peers          | 1 byte   | Number of peers being shared        |
| Sender Name Length | 2 bytes  | UTF-8 encoded sender name length    |
| Peer List          | variable | IP (4B), port (2B), peerID (2B) × n |
| Sender Name        | variable | UTF-8 string                        |
| Self Info (JSON)   | variable | Optional metadata block             |

---

## 📈 Heartbeat System

* Sends a heartbeat every **20 seconds** to all peers
* Missed 3 consecutive heartbeats? → Peer is **evicted**
* Uses short-lived TCP connections to simulate lightweight RPCs

---

## 📚 Background

Kademlia is a structured peer-to-peer protocol that allows efficient decentralized lookup with logarithmic complexity. This implementation simplifies the design to demonstrate:

* XOR metric for distance-based routing
* Routing table maintenance via k-buckets
* Minimal peer communication protocol
* Real-world reliability features (heartbeats, evictions)

---

