const promClient = require('prom-client');

// Optionally collect default metrics
promClient.collectDefaultMetrics();

const editLatencyHistogram = new promClient.Histogram({
    name: 'edit_latency_ms',
    help: 'OT processing latency in ms',
    buckets: [5, 10, 50, 100, 500, 1000]
});
const transformConflictsCounter = new promClient.Counter({
    name: 'transform_conflicts_total',
    help: 'Total concurrent operations that required transformation',
});
const validationFailuresCounter = new promClient.Counter({
    name: 'validation_failures_total',
    help: 'Total failed validation attempts',
});
const snapshotCountGauge = new promClient.Gauge({
    name: 'snapshot_count',
    help: 'Total number of snapshots created',
});

module.exports = {
    promClient,
    editLatencyHistogram,
    transformConflictsCounter,
    validationFailuresCounter,
    snapshotCountGauge
};
