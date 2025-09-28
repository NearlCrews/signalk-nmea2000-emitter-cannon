import type { ConversionModule, N2KMessage, SignalKApp } from '../types/index.js';

interface Position {
  latitude?: number;
  longitude?: number;
}

interface AisShipType {
  id?: number;
  name?: string;
}

interface Design {
  length?: { overall?: number };
  beam?: number;
  draft?: { maximum?: number };
  aisShipType?: AisShipType;
}

interface Vessel {
  name?: string;
  mmsi?: string;
  design?: Design;
  navigation?: {
    position?: Position;
    courseOverGroundTrue?: number;
    speedOverGround?: number;
    headingTrue?: number;
    rateOfTurn?: number;
    state?: string;
    destination?: { commonName?: string };
  };
  sensors?: {
    ais?: {
      fromCenter?: number;
      fromBow?: number;
    };
  };
  communication?: {
    callsignVhf?: string;
  };
  registrations?: {
    imo?: string;
  };
  atonType?: {
    id?: number;
    name?: string;
  };
}

interface AisDelta {
  context: string;
  updates: Array<{
    values: Array<{
      path: string;
      value: unknown;
    }>;
  }>;
}

const staticKeys = [
  "name",
  "design.aisShipType",
  "design.draft",
  "design.length",
  "design.beam",
  "sensors.ais.fromCenter",
  "sensors.ais.fromBow",
  "design.draft",
  "registrations.imo",
];

const positionKeys = ["navigation.position"];

const navStatusMapping: Record<string, number> = {
  "not under command": 2,
  anchored: 1,
  moored: 5,
  sailing: 8,
  motoring: 0,
  "towing < 200m": 3,
  "towing > 200m": 3,
  pushing: 3,
  fishing: 7,
  "fishing-hampered": 7,
  trawling: 7,
  "trawling-shooting": 7,
  "trawling-hauling": 7,
  "not-under-way": 2,
  aground: 6,
  "restricted manouverability": 3,
  "restricted manouverability towing < 200m": 3,
  "restricted manouverability towing > 200m": 3,
  "restricted manouverability underwater operations": 3,
  "constrained by draft": 4,
  "ais-sart": 14,
  "hazardous material high speed": 9,
  "hazardous material wing in ground": 10,
};

export default function createAisConversion(app: SignalKApp): ConversionModule {
  return {
    title: "AIS (129794, 129038, 129041)",
    sourceType: "onDelta",
    optionKey: "AIS",
    callback: (delta: unknown): N2KMessage[] => {
      if (!delta || typeof delta !== 'object') {
        return [];
      }

      const deltaMsg = delta as AisDelta;
      const selfContext = `vessels.${app.selfId || 'self'}`;

      if (deltaMsg.context === selfContext || isN2K(deltaMsg)) {
        return [];
      }

      if (deltaMsg.context.startsWith("vessels.")) {
        const hasStatic = hasAnyKeys(deltaMsg, staticKeys);
        const hasPosition = hasAnyKeys(deltaMsg, positionKeys);

        if (!hasStatic && !hasPosition) {
          return [];
        }

        const vessel = app.getPath(deltaMsg.context) as Vessel;
        const mmsiValue = findDeltaValue(vessel, deltaMsg, "mmsi");

        if (!mmsiValue || typeof mmsiValue !== 'string') {
          return [];
        }

        const res: N2KMessage[] = [];
        if (hasPosition) {
          const posMsg = generatePosition(vessel, mmsiValue, deltaMsg);
          if (posMsg) res.push(posMsg);
        }

        if (hasStatic) {
          const staticMsg = generateStatic(vessel, mmsiValue, deltaMsg);
          if (staticMsg) res.push(staticMsg);
        }
        return res;
      } else if (deltaMsg.context.startsWith("atons.")) {
        const vessel = app.getPath(deltaMsg.context) as Vessel;
        const mmsiValue = findDeltaValue(vessel, deltaMsg, "mmsi");

        if (!mmsiValue || typeof mmsiValue !== 'string') {
          return [];
        }

        const atonMsg = generateAtoN(vessel, mmsiValue, deltaMsg);
        return atonMsg ? [atonMsg] : [];
      }

      return [];
    },
    tests: [
      {
        input: [
          {
            context: "vessels.urn:mrn:imo:mmsi:367301250",
            updates: [
              {
                values: [
                  {
                    path: "navigation.position",
                    value: { longitude: -76.3947165, latitude: 39.1296167 },
                  },
                  { path: "navigation.courseOverGroundTrue", value: 1.501 },
                  { path: "navigation.speedOverGround", value: 0.05 },
                  { path: "navigation.headingTrue", value: 5.6199 },
                  { path: "navigation.rateOfTurn", value: 0 },
                  { path: "navigation.state", value: "motoring" },
                  {
                    path: "navigation.destination.commonName",
                    value: "BALTIMORE",
                  },
                  { path: "sensors.ais.fromBow", value: 9 },
                  { path: "sensors.ais.fromCenter", value: 0 },
                  { path: "design.draft", value: { maximum: 4.2 } },
                  { path: "design.length", value: { overall: 30 } },
                  {
                    path: "design.aisShipType",
                    value: { id: 52, name: "Tug" },
                  },
                  { path: "design.beam", value: 7 },
                  { path: "", value: { mmsi: "367301250" } },
                  { path: "", value: { name: "SOME BOAT" } },
                ],
              },
            ],
          },
        ],
        expected: [
          {
            prio: 2,
            pgn: 129038,
            dst: 255,
            fields: {
              messageId: "Scheduled Class A position report",
              userId: 367301250,
              longitude: -76.3947165,
              latitude: 39.1296167,
              positionAccuracy: "Low",
              raim: "not in use",
              timeStamp: "0",
              cog: 1.501,
              sog: 0.05,
              aisTransceiverInformation: "Channel A VDL reception",
              heading: 5.6199,
              rateOfTurn: 0,
              navStatus: "Under way using engine",
            },
          },
          {
            prio: 2,
            pgn: 129794,
            dst: 255,
            fields: {
              messageId: "Static and voyage related data",
              userId: 367301250,
              name: "SOME BOAT",
              typeOfShip: "Tug",
              length: 30,
              beam: 7,
              positionReferenceFromBow: 9,
              positionReferenceFromStarboard: 3.5,
              draft: 4.2,
              destination: "BALTIMORE",
              aisVersionIndicator: "ITU-R M.1371-1",
              dte: "Available",
              reserved: 1,
              aisTransceiverInformation: "Channel A VDL reception",
            },
          },
        ],
      },
      {
        input: [
          {
            context: "atons.urn:mrn:imo:mmsi:993672085",
            updates: [
              {
                values: [
                  { path: "", value: { name: "78A" } },
                  {
                    path: "navigation.position",
                    value: {
                      longitude: -76.4313882,
                      latitude: 38.5783333,
                    },
                  },
                  {
                    path: "atonType",
                    value: {
                      id: 14,
                      name: "Beacon, Starboard Hand",
                    },
                  },
                  {
                    path: "",
                    value: {
                      mmsi: "993672085",
                    },
                  },
                  {
                    path: "sensors.ais.class",
                    value: "ATON",
                  },
                ],
              },
            ],
          },
        ],
        expected: [
          {
            prio: 2,
            pgn: 129041,
            dst: 255,
            fields: {
              messageId: 0,
              repeatIndicator: "Initial",
              userId: 993672085,
              longitude: -76.4313882,
              latitude: 38.5783333,
              positionAccuracy: "Low",
              raim: "not in use",
              timeStamp: "0",
              atonType: "Fixed beacon: starboard hand",
              offPositionIndicator: "Yes",
              virtualAtonFlag: "Yes",
              assignedModeFlag: "Assigned mode",
              spare: 1,
              atonName: "78A",
            },
          },
        ],
      },
    ],
  };
}

function generateStatic(vessel: Vessel, mmsi: string, delta: AisDelta): N2KMessage | null {
  const name = findDeltaValue(vessel, delta, "name") as string;
  const typeObj = findDeltaValue(vessel, delta, "design.aisShipType") as AisShipType;
  const type = typeObj?.id;
  const callsign = findDeltaValue(vessel, delta, "communication.callsignVhf") as string;
  const lengthObj = findDeltaValue(vessel, delta, "design.length") as { overall?: number };
  const length = lengthObj?.overall;
  const beam = findDeltaValue(vessel, delta, "design.beam") as number;
  const fromCenter = findDeltaValue(vessel, delta, "sensors.ais.fromCenter") as number;
  const fromBow = findDeltaValue(vessel, delta, "sensors.ais.fromBow") as number;
  const draftObj = findDeltaValue(vessel, delta, "design.draft") as { maximum?: number };
  const draft = draftObj?.maximum;
  // IMO registration (not currently used in static message)
  // const imo = findDeltaValue(vessel, delta, "registrations.imo") as string;
  const dest = findDeltaValue(vessel, delta, "navigation.destination.commonName") as string;

  // IMO number processing (not currently used in static message)
  // let imoNumber = 0;
  // if (imo) {
  //   const parts = imo.split(imo);
  //   imoNumber = Number(parts[parts.length - 1]);
  // }

  let fromStarboard: number | undefined;
  if (beam != null && fromCenter != null) {
    fromStarboard = beam / 2 + fromCenter;
  }

  const mmsiNumber = Number.parseInt(mmsi, 10);

  return {
    prio: 2,
    pgn: 129794,
    dst: 255,
    fields: {
      messageId: "Static and voyage related data",
      userId: mmsiNumber,
      callsign: callsign,
      name: name,
      typeOfShip: type,
      length: length,
      beam: beam,
      positionReferenceFromStarboard: fromStarboard,
      positionReferenceFromBow: fromBow,
      draft: draft,
      destination: dest,
      aisVersionIndicator: "ITU-R M.1371-1",
      dte: "Available",
      aisTransceiverInformation: "Channel A VDL reception",
    },
  };
}

function generatePosition(vessel: Vessel, mmsi: string, delta: AisDelta): N2KMessage | null {
  const position = findDeltaValue(vessel, delta, "navigation.position") as Position;

  if (!position?.latitude || !position.longitude) {
    return null;
  }

  const cog = findDeltaValue(vessel, delta, "navigation.courseOverGroundTrue") as number;
  const sog = findDeltaValue(vessel, delta, "navigation.speedOverGround") as number;
  const heading = findDeltaValue(vessel, delta, "navigation.headingTrue") as number;
  const rot = findDeltaValue(vessel, delta, "navigation.rateOfTurn") as number;
  const state = findDeltaValue(vessel, delta, "navigation.state") as string;

  let status = 0;
  if (state && navStatusMapping[state] != null) {
    status = navStatusMapping[state];
  }

  // Validate angle ranges
  const validCog = cog != null && cog <= Math.PI * 2 ? cog : undefined;
  const validHeading = heading != null && heading <= Math.PI * 2 ? heading : undefined;

  const mmsiNumber = Number.parseInt(mmsi, 10);

  return {
    prio: 2,
    pgn: 129038,
    dst: 255,
    fields: {
      messageId: "Scheduled Class A position report",
      userId: mmsiNumber,
      longitude: position.longitude,
      latitude: position.latitude,
      positionAccuracy: "Low",
      raim: "not in use",
      timeStamp: "0",
      cog: validCog,
      sog: sog,
      aisTransceiverInformation: "Channel A VDL reception",
      heading: validHeading,
      rateOfTurn: rot,
      navStatus:
        Object.keys(navStatusMapping).find((key) => navStatusMapping[key] === status) || "Under way using engine",
    },
  };
}

function generateAtoN(vessel: Vessel, mmsi: string, delta: AisDelta): N2KMessage | null {
  const position = findDeltaValue(vessel, delta, "navigation.position") as Position;

  if (!position?.latitude || !position.longitude) {
    return null;
  }

  const name = vessel.name || (findDeltaValue(vessel, delta, "name") as string);
  // AtoN type (not currently used in message)
  // const typeObj = findDeltaValue(vessel, delta, "atonType") as { id?: number; name?: string };
  const lengthObj = findDeltaValue(vessel, delta, "design.length") as { overall?: number };
  const length = lengthObj?.overall;
  const beam = findDeltaValue(vessel, delta, "design.beam") as number;
  const fromCenter = findDeltaValue(vessel, delta, "sensors.ais.fromCenter") as number;
  const fromBow = findDeltaValue(vessel, delta, "sensors.ais.fromBow") as number;

  let fromStarboard: number | undefined;
  if (beam != null && fromCenter != null) {
    fromStarboard = beam / 2 + fromCenter;
  }

  const fromBowScaled = fromBow ? fromBow * 10 : undefined;
  const mmsiNumber = Number.parseInt(mmsi, 10);

  return {
    prio: 2,
    pgn: 129041,
    dst: 255,
    fields: {
      messageId: 0,
      repeatIndicator: "Initial",
      userId: mmsiNumber,
      longitude: position.longitude,
      latitude: position.latitude,
      positionAccuracy: "Low",
      raim: "not in use",
      timeStamp: "0",
      lengthDiameter: length,
      beamDiameter: beam,
      positionReferenceFromStarboardEdge: fromStarboard,
      positionReferenceFromTrueNorthFacingEdge: fromBowScaled,
      atonType: "Fixed beacon: starboard hand",
      offPositionIndicator: "Yes",
      virtualAtonFlag: "Yes",
      assignedModeFlag: "Assigned mode",
      spare: 1,
      atonName: name,
    },
  };
}

function hasAnyKeys(delta: AisDelta, keys: string[]): boolean {
  if (!delta.updates) return false;

  for (const update of delta.updates) {
    if (!Array.isArray(update.values)) continue;

    for (const valueUpdate of update.values) {
      const valuePath = valueUpdate.path;
      const value = valueUpdate.value;

      if (valuePath === "" && typeof value === 'object' && value != null) {
        const valueKeys = Object.keys(value);
        if (valueKeys.some(key => keys.includes(key))) {
          return true;
        }
      } else if (keys.includes(valuePath)) {
        return true;
      }
    }
  }
  return false;
}

function findDeltaValue(vessel: Vessel, delta: AisDelta, path: string): unknown {
  if (!delta.updates) return undefined;

  for (const update of delta.updates) {
    for (const valueUpdate of update.values) {
      const valuePath = valueUpdate.path;
      const value = valueUpdate.value;
      
      if (valuePath === "" && path.indexOf(".") === -1) {
        if (typeof value === 'object' && value != null && path in value) {
          return (value as Record<string, unknown>)[path];
        }
      } else if (path === valuePath) {
        return value;
      }
    }
  }

  // Fallback to vessel data
  const pathParts = path.split('.');
  let val: unknown = vessel;
  for (const part of pathParts) {
    if (val && typeof val === 'object' && val != null) {
      val = (val as Record<string, unknown>)[part];
    } else {
      val = undefined;
      break;
    }
  }
  
  return val && typeof val === 'object' && val != null && 'value' in val
    ? (val as { value: unknown }).value 
    : val;
}

function isN2K(_delta: AisDelta): boolean {
  return false;
}
