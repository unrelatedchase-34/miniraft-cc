const axios = require("axios");

class RaftNode {
    constructor(id, peers) {
        this.id = id;
        this.peers = peers;
        this.state = "FOLLOWER";
        this.currentTerm = 0;
        this.votedFor = null;
        this.log = [];
        this.commitIndex = -1;
        this.lastApplied = -1;
        this.nextIndex = {};
        this.matchIndex = {};
        this.leaderId = null;
        this.electionTimeout = null;
        this.heartbeatInterval = null;
    }

    start() { this.resetElectionTimer(); }
    isLeader() { return this.state === "LEADER"; }

    resetElectionTimer() {
        if (this.electionTimeout) clearTimeout(this.electionTimeout);
        // Wider range = less split votes (500ms–1500ms)
        const timeout = Math.random() * 1000 + 500;
        this.electionTimeout = setTimeout(() => this.startElection(), timeout);
    }

    async startElection() {
        this.state = "CANDIDATE";
        this.currentTerm++;
        this.votedFor = this.id;
        let votes = 1;

        console.log(`[${this.id}] Candidate (term ${this.currentTerm})`);

        const lastLogIndex = this.log.length - 1;
        const lastLogTerm = lastLogIndex >= 0 ? this.log[lastLogIndex].term : 0;

        const votePromises = this.peers.map(peer =>
            axios.post(`${peer}/raft/request-vote`, {
                term: this.currentTerm,
                candidateId: this.id,
                lastLogIndex,
                lastLogTerm
            }, { timeout: 300 }).then(res => res.data.voteGranted ? 1 : 0).catch(() => 0)
        );

        const results = await Promise.all(votePromises);
        votes += results.reduce((a, b) => a + b, 0);

        // Majority of total cluster (4 nodes = need 3, 3 nodes alive = still need 3)
        // But use responding nodes to handle offline replicas:
        const majority = Math.floor((this.peers.length + 1) / 2) + 1;

        if (this.state !== "CANDIDATE") return;

        if (votes >= majority) {
            this.becomeLeader();
        } else {
            this.state = "FOLLOWER";
            // Random backoff before retrying to break split vote loops
            await new Promise(r => setTimeout(r, Math.random() * 300));
            this.resetElectionTimer();
        }
    }

    becomeLeader() {
        this.state = "LEADER";
        this.leaderId = this.id;
        console.log(`[${this.id}] LEADER (term ${this.currentTerm})`);
        for (const peer of this.peers) {
            this.nextIndex[peer] = this.log.length;
            this.matchIndex[peer] = -1;
        }
        this.startHeartbeat();
    }

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 150);
    }

    async sendHeartbeat() {
        for (const peer of this.peers) {
            const prevLogIndex = (this.nextIndex[peer] || 0) - 1;
            const prevLogTerm = prevLogIndex >= 0 && this.log[prevLogIndex] ? this.log[prevLogIndex].term : 0;
            try {
                const res = await axios.post(`${peer}/raft/append-entries`, {
                    term: this.currentTerm,
                    leaderId: this.id,
                    prevLogIndex,
                    prevLogTerm,
                    entries: [],
                    leaderCommit: this.commitIndex
                }, { timeout: 300 });
                if (res.data.term > this.currentTerm) this.stepDown(res.data.term);
            } catch (e) {}
        }
    }

    async appendEntry(data) {
        const entry = { term: this.currentTerm, index: this.log.length, data };
        this.log.push(entry);
        console.log(`[${this.id}] Appended entry index=${entry.index}, replicating...`);

        let acks = 1;

        const replicatePromises = this.peers.map(async (peer) => {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const prevLogIndex = entry.index - 1;
                    const prevLogTerm = prevLogIndex >= 0 && this.log[prevLogIndex] ? this.log[prevLogIndex].term : 0;
                    const res = await axios.post(`${peer}/raft/append-entries`, {
                        term: this.currentTerm,
                        leaderId: this.id,
                        prevLogIndex,
                        prevLogTerm,
                        entries: [entry],
                        leaderCommit: this.commitIndex
                    }, { timeout: 300 });
                    if (res.data.success) {
                        this.matchIndex[peer] = entry.index;
                        this.nextIndex[peer] = entry.index + 1;
                        return 1;
                    } else {
                        this.nextIndex[peer] = Math.max(0, (this.nextIndex[peer] || 0) - 1);
                    }
                } catch (e) {
                    await new Promise(r => setTimeout(r, 50));
                }
            }
            return 0;
        });

        const results = await Promise.all(replicatePromises);
        acks += results.reduce((a, b) => a + b, 0);

        const majority = Math.floor((this.peers.length + 1) / 2) + 1;
        if (acks >= majority) {
            this.commitIndex = entry.index;
            this.lastApplied = entry.index;
            console.log(`[${this.id}] Committed index=${entry.index} (${acks} acks)`);
            return true;
        }
        console.log(`[${this.id}] NOT committed — only ${acks} acks`);
        return false;
    }

    handleRequestVote(data) {
        const { term, candidateId, lastLogIndex, lastLogTerm } = data;
        if (term > this.currentTerm) this.stepDown(term);

        let voteGranted = false;
        if (term === this.currentTerm && (this.votedFor === null || this.votedFor === candidateId)) {
            const myLastIndex = this.log.length - 1;
            const myLastTerm = myLastIndex >= 0 ? this.log[myLastIndex].term : 0;
            const candidateLogOk = (lastLogTerm > myLastTerm) ||
                (lastLogTerm === myLastTerm && lastLogIndex >= myLastIndex);
            if (candidateLogOk) {
                voteGranted = true;
                this.votedFor = candidateId;
                this.resetElectionTimer();
            }
        }
        return { voteGranted, term: this.currentTerm };
    }

    handleAppendEntries(data) {
        const { term, leaderId, prevLogIndex, prevLogTerm, entries, leaderCommit } = data;
        if (term < this.currentTerm) return { success: false, term: this.currentTerm };
        if (term > this.currentTerm) this.stepDown(term);

        this.state = "FOLLOWER";
        this.leaderId = leaderId;
        this.currentTerm = term;
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.resetElectionTimer();

        if (prevLogIndex >= 0) {
            if (!this.log[prevLogIndex] || this.log[prevLogIndex].term !== prevLogTerm) {
                console.log(`[${this.id}] Log inconsistency at index ${prevLogIndex} — rejecting`);
                return { success: false, term: this.currentTerm };
            }
        }

        if (entries && entries.length > 0) {
            for (const entry of entries) {
                if (this.log[entry.index] && this.log[entry.index].term !== entry.term) {
                    this.log = this.log.slice(0, entry.index);
                }
                if (!this.log[entry.index]) {
                    this.log.push(entry);
                    console.log(`[${this.id}] Follower appended index=${entry.index}`);
                }
            }
        }

        if (leaderCommit !== undefined && leaderCommit > this.commitIndex) {
            this.commitIndex = Math.min(leaderCommit, this.log.length - 1);
            this.lastApplied = this.commitIndex;
        }

        return { success: true, term: this.currentTerm };
    }

    stepDown(newTerm) {
        console.log(`[${this.id}] Stepping down — term ${newTerm}`);
        this.currentTerm = newTerm;
        this.state = "FOLLOWER";
        this.votedFor = null;
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.resetElectionTimer();
    }
}

module.exports = { RaftNode };
