
// Mock cleaning
const pids = ["E-7.A", "E-133.A", "E-158"];
const cleaned = pids.map(pid => pid.replace(/\.A$/, ''));
console.log(cleaned);
