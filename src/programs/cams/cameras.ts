/**
 * The site's cameras as CAMS knows them. The archive is the weekly round the site assistant
 * took on 8 November; she wrote its index, and the index says nothing happened. The pictures
 * say otherwise, and what they show is marked in red once a picture has loaded.
 */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Camera {
  /** The picture, a key of PICTURE_DATA. */
  picture: string;
  camera: string;
  place: string;
  /** YYYY-MM-DD HH:MM:SS, burned into the picture. */
  stamp: string;
  /** What the site assistant wrote for it in the archive index. */
  index: string;
  /** What the picture shows that the index leaves out: a clue phrase, drawn red. */
  clue?: string;
  /** Where to look, in picture pixels (320 x 176). */
  box?: Box;
}
export const ARCHIVE_DATE = '11-08-91';
export const ARCHIVE: readonly Camera[] = [
  {
    picture: 'security',
    camera: '01',
    place: 'SECURITY OFFICE',
    stamp: '1991-11-08 02:33:18',
    index: 'NO ACTIVITY',
  },
  {
    picture: 'lobby',
    camera: '03',
    place: 'ELEVATOR LOBBY',
    stamp: '1991-11-08 02:53:11',
    index: 'NO ACTIVITY',
  },
  {
    picture: 'server',
    camera: '04',
    place: 'SERVER ROOM',
    stamp: '1991-11-08 02:17:43',
    index: 'NO ACTIVITY',
  },
  {
    picture: 'corridor',
    camera: '04',
    place: 'CORRIDOR B-3',
    stamp: '1991-11-08 02:17:43',
    index: 'NO ACTIVITY',
  },
  {
    picture: 'exam',
    camera: '06',
    place: 'B3 EXAM ROOMS',
    stamp: '1991-11-08 02:31:04',
    index: 'NO ACTIVITY',
  },
  {
    picture: 'dock',
    camera: '09',
    place: 'LOADING DOCK B1',
    stamp: '1991-11-08 02:36:42',
    index: 'SHUTTER HALF OPEN',
  },
  {
    picture: 'canteen',
    camera: '12',
    place: 'CANTEEN LEVEL B',
    stamp: '1991-11-08 02:24:09',
    index: 'NO ACTIVITY',
  },
  {
    picture: 'garage',
    camera: '14',
    place: 'GARAGE B2',
    stamp: '1991-11-08 02:39:20',
    index: 'NO ACTIVITY',
    clue: '14 CARS STILL PARKED',
    box: { x: 2, y: 18, width: 212, height: 118 },
  },
  {
    picture: 'archive',
    camera: '17',
    place: 'ARCHIVE B6',
    stamp: '1991-11-08 02:42:06',
    index: 'NO ACTIVITY',
  },
  {
    picture: 'decon',
    camera: '21',
    place: 'DECONTAMINATION',
    stamp: '1991-11-08 02:44:51',
    index: 'NO ACTIVITY',
    clue: 'DECON CYCLES RUN: 212',
    box: { x: 118, y: 84, width: 160, height: 46 },
  },
  {
    picture: 'lab',
    camera: '24',
    place: 'LABORATORY B2',
    stamp: '1991-11-08 02:47:13',
    index: 'NO ACTIVITY',
  },
  {
    picture: 'generator',
    camera: '27',
    place: 'GENERATOR ROOM',
    stamp: '1991-11-08 02:50:37',
    index: 'GENERATOR 1 RUNNING',
  },
  {
    picture: 'dorm',
    camera: '31',
    place: 'DORMITORY B3-7',
    stamp: '1991-11-08 02:56:29',
    index: 'NO ACTIVITY',
    clue: 'PERSONAL EFFECTS LEFT BEHIND',
    box: { x: 1, y: 70, width: 50, height: 74 },
  },
];
/** Cameras that only ever show a picture live, when something happens tonight. */
export const LIVE: Record<string, Omit<Camera, 'stamp'>> = {
  operator: {
    picture: 'operator',
    camera: '18',
    place: 'CONTROL ROOM',
    index: 'NEW CAPTURE',
    clue: 'THE CAMERA IS BEHIND YOU.',
    box: { x: 106, y: 34, width: 60, height: 96 },
  },
  robots: {
    picture: 'robots',
    camera: '04',
    place: 'CORRIDOR B-3',
    index: 'MAINTENANCE UNITS MOVING',
  },
};
