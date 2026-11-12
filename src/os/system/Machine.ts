/** The control-room hardware behind the AEGIS tools: bus processes, backup cell, users. */
export type ProcessId = '01' | '02' | '03' | '04' | '05' | '06';
export type ProcessState = 'running' | 'suspended' | 'offline';
export type User = 'OP-17' | 'SUPERVISOR';
export interface MachineState {
  processes: Record<ProcessId, ProcessState>;
  /** Backup cell charge in percent. */
  cell: number;
  user: User;
  /** Seconds added to the clock with TIME, and days added with DATE. */
  clockOffset: number;
  dateOffset: number;
  /** LIMBIC.SYS was loaded at the last boot. */
  limbicLoaded: boolean;
}
export const processes: Record<ProcessId, { name: string; kilowatts: number }> = {
  '01': { name: 'ENVIRONMENT', kilowatts: 0.04 },
  '02': { name: 'SITE CARRIER', kilowatts: 0 },
  '03': { name: 'DOOR CONTROL', kilowatts: 0.01 },
  '04': { name: 'LIMBIC', kilowatts: 0.86 },
  '05': { name: 'MAINTENANCE UNITS', kilowatts: 0.06 },
  '06': { name: 'VENTILATION', kilowatts: 0.08 },
};
/** What process 04's other half acts through: the doors, the maintenance units, the air. */
export const HANDS: readonly ProcessId[] = ['05', '06', '03'];
/** Usable energy in the backup cell at 100 percent. */
export const CELL_KWH = 12.5;
export const SUPERVISOR_PASSWORD = 'WESTWING';
export const newMachine = (): MachineState => ({
  processes: {
    '01': 'running',
    '02': 'offline',
    '03': 'running',
    '04': 'running',
    '05': 'running',
    '06': 'running',
  },
  cell: 11,
  user: 'OP-17',
  clockOffset: 0,
  dateOffset: 0,
  limbicLoaded: true,
});
export class Machine {
  constructor(public state: MachineState) {}
  /** Present draw on the auxiliary bus, in kilowatts. */
  load() {
    return (Object.keys(processes) as ProcessId[]).reduce(
      (total, id) => total + (this.state.processes[id] === 'running' ? processes[id].kilowatts : 0),
      0,
    );
  }
  /** Minutes the cell lasts at the present load. */
  runtime() {
    const load = this.load();
    return load ? ((this.state.cell / 100) * CELL_KWH * 60) / load : Infinity;
  }
  /** Runs the bus for a number of seconds and returns the remaining charge. */
  drain(seconds: number) {
    const used = ((this.load() * seconds) / 3600 / CELL_KWH) * 100;
    this.state.cell = Math.max(0, this.state.cell - used);
    return this.state.cell;
  }
  suspend(id: ProcessId): 'suspended' | 'already' | 'offline' {
    const current = this.state.processes[id];
    if (current === 'offline') return 'offline';
    if (current === 'suspended') return 'already';
    this.state.processes[id] = 'suspended';
    return 'suspended';
  }
  resume(id: ProcessId): 'running' | 'already' | 'offline' {
    const current = this.state.processes[id];
    if (current === 'offline') return 'offline';
    if (current === 'running') return 'already';
    this.state.processes[id] = 'running';
    return 'running';
  }
  login(user: string, password: string): boolean {
    if (user.toUpperCase() === 'OP-17') {
      this.state.user = 'OP-17';
      return true;
    }
    if (user.toUpperCase() !== 'SUPERVISOR' || password.toUpperCase() !== SUPERVISOR_PASSWORD)
      return false;
    this.state.user = 'SUPERVISOR';
    return true;
  }
  get supervisor() {
    return this.state.user === 'SUPERVISOR';
  }
  /** None of the three systems she acts through is running. */
  get protected() {
    return HANDS.every((id) => this.state.processes[id] !== 'running');
  }
  /** Brings the bus up after a reboot: processes restart, 04 only if its driver loaded. */
  boot(limbicLoaded: boolean) {
    this.state.limbicLoaded = limbicLoaded;
    this.state.processes = {
      '01': 'running',
      '02': 'offline',
      '03': 'running',
      '04': limbicLoaded ? 'running' : 'offline',
      '05': 'running',
      '06': 'running',
    };
    this.state.user = 'OP-17';
  }
}
