import type { ConversionModule, N2KMessage } from '../types/index.js';

interface AcknowledgmentPath {
  pgn?: number;
}

export default function createIsoMessagesConversions(): ConversionModule[] {
  return [
    // ISO Acknowledgment (PGN 59392)
    {
      title: "ISO Acknowledgment (59392)",
      optionKey: "ISO_ACKNOWLEDGMENT",
      keys: ["communication.pathToAcknowledge"],
      timeouts: [30000],
      callback: (pathToAcknowledge: unknown): N2KMessage[] => {
        if (pathToAcknowledge == null) {
          return [];
        }

        const path = pathToAcknowledge as AcknowledgmentPath;

        return [
          {
            prio: 2,
            pgn: 59392,
            dst: 255,
            fields: {
              controlByte: 0, // Positive acknowledgment
              groupFunction: 255, // Not group function specific
              pgn: path.pgn || 0,
              reserved: 16777215,
            },
          },
        ];
      },
      tests: [
        {
          input: [{ pgn: 126992 }],
          expected: [
            {
              prio: 2,
              pgn: 59392,
              dst: 255,
              fields: {
                controlByte: 0,
                groupFunction: 255,
                pgn: 126992,
                reserved: 16777215,
              },
            },
          ],
        },
      ],
    },

    // ISO Request (PGN 59904)
    {
      title: "ISO Request (59904)",
      optionKey: "ISO_REQUEST",
      keys: ["communication.requestedPGN"],
      timeouts: [30000],
      callback: (requestedPGN: unknown): N2KMessage[] => {
        if (requestedPGN == null) {
          return [];
        }

        const pgn = typeof requestedPGN === 'number' ? requestedPGN : 0;

        return [
          {
            prio: 2,
            pgn: 59904,
            dst: 255,
            fields: {
              pgn: pgn,
            },
          },
        ];
      },
      tests: [
        {
          input: [126992],
          expected: [
            {
              prio: 2,
              pgn: 59904,
              dst: 255,
              fields: {
                pgn: 126992,
              },
            },
          ],
        },
      ],
    },

    // ISO Address Claim (PGN 60928)
    {
      title: "ISO Address Claim (60928)",
      optionKey: "ISO_ADDRESS_CLAIM",
      keys: [
        "design.manufacturer.industryCode",
        "design.manufacturer.deviceInstance",
        "design.manufacturer.deviceFunction",
        "design.manufacturer.deviceClass",
        "design.manufacturer.systemInstance",
      ],
      timeouts: [300000, 300000, 300000, 300000, 300000], // 5 minutes
      callback: (
        industryCode: unknown,
        deviceInstance: unknown,
        deviceFunction: unknown,
        deviceClass: unknown,
        systemInstance: unknown
      ): N2KMessage[] => {
        // Only send address claim if we have basic device info
        if (industryCode == null && deviceFunction == null) {
          return [];
        }

        const deviceInstanceValue = typeof deviceInstance === 'number' ? deviceInstance : 0;

        return [
          {
            prio: 6,
            pgn: 60928,
            dst: 255,
            fields: {
              uniqueNumber: deviceInstanceValue,
              manufacturerCode: typeof industryCode === 'number' ? industryCode : 1851, // Default to Signal K
              deviceInstanceLower: deviceInstanceValue & 0x07,
              deviceInstanceUpper: (deviceInstanceValue >> 3) & 0x1f,
              deviceFunction: typeof deviceFunction === 'number' ? deviceFunction : 130, // Navigation display/chartplotter
              reserved: 0,
              deviceClass: typeof deviceClass === 'number' ? deviceClass : 25, // Inter/Intranetwork Device
              systemInstance: typeof systemInstance === 'number' ? systemInstance : 0,
              industryCode: 4, // Marine Industry
              arbitraryAddressCapable: 1,
            },
          },
        ];
      },
      tests: [
        {
          input: [1851, 1, 130, 25, 0],
          expected: [
            {
              prio: 6,
              pgn: 60928,
              dst: 255,
              fields: {
                uniqueNumber: 1,
                manufacturerCode: 1851,
                deviceInstanceLower: 1,
                deviceInstanceUpper: 0,
                deviceFunction: 130,
                reserved: 0,
                deviceClass: 25,
                systemInstance: 0,
                industryCode: 4,
                arbitraryAddressCapable: 1,
              },
            },
          ],
        },
      ],
    },
  ];
}
