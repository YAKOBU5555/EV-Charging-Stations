const { calculateHealth, classify } = require('../utils/healthCalculator');

const config = {
  thresholds: {
    temperature: { normal: 60, warning: 60, critical: 75 },
    voltage: { min: 380, max: 450, tolerance: 40 },
    current: { max: 250 },
    heartbeat: { warningMs: 30000, offlineMs: 90000 },
    maintenance: { reminderDays: 7 }
  },
  healthWeights: { communication: 25, temperature: 20, voltage: 15, current: 15, errorStatus: 15, maintenance: 10 },
  criticalErrorCodes: ['E-OVERHEAT', 'E-HARDWARE']
};

const charger = { chargerId: 'CHG-1', maxCurrent: 150, errorCode: 'NONE' };
const nominal = { voltage: 415, current: 90, power: 37, temperature: 40, errorCode: 'NONE', lastHeartbeat: new Date() };

describe('Health score', () => {
  test('a nominal charger scores as Healthy', () => {
    const result = calculateHealth(nominal, charger, config);
    expect(result.score).toBe(100);
    expect(result.status).toBe('Healthy');
  });

  test('temperature above the critical limit drags the score down', () => {
    const hot = calculateHealth({ ...nominal, temperature: 80 }, charger, config);
    expect(hot.score).toBeLessThan(100);
    expect(hot.reasons.join(' ')).toMatch(/Temperature/);
  });

  test('a lost heartbeat forces a Critical classification', () => {
    const silent = calculateHealth({ ...nominal, lastHeartbeat: new Date(Date.now() - 200000) }, charger, config);
    expect(silent.status).toBe('Critical');
    expect(silent.components.communication).toBe(0);
  });

  test('a critical error code zeroes the error component', () => {
    const faulted = calculateHealth({ ...nominal, errorCode: 'E-OVERHEAT' }, charger, config);
    expect(faulted.components.errorStatus).toBe(0);
    expect(faulted.score).toBeLessThan(90);
  });

  test('overdue maintenance is penalised', () => {
    const overdue = calculateHealth(nominal, { ...charger, nextMaintenanceDate: new Date(Date.now() - 86400000) }, config);
    expect(overdue.components.maintenance).toBe(0);
  });

  test('scores map to the documented bands', () => {
    expect(classify(95)).toBe('Healthy');
    expect(classify(75)).toBe('Warning');
    expect(classify(50)).toBe('Degraded');
    expect(classify(10)).toBe('Critical');
  });
});
