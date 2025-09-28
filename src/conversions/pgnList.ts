import type { ConversionModule, N2KMessage } from '../types/index.js';

export default function createPgnListConversion(): ConversionModule {
  return {
    title: "PGN List (126464)",
    optionKey: "PGN_LIST",
    keys: ["communication.pgnListRequest"],
    callback: (_pgnListRequest: unknown): N2KMessage[] => {
      // Respond to PGN list requests or send periodically
      const transmitPGNs = [
        59392,
        59904,
        60928, // ISO Messages
        126996,
        126464, // Product Info, PGN List
        127245,
        127258, // Rudder, Magnetic Variance
        127488,
        127489, // Engine Parameters (existing)
        127493,
        127498, // Transmission, Engine Static
        127506,
        127508, // Battery Status (existing)
        128259,
        128267, // Speed, Water Depth (existing)
        128275, // Distance Log (existing)
        129025,
        129026, // Position, COG & SOG (existing)
        129029,
        129033, // GNSS Position, Time & Date (existing)
        129038,
        129039,
        129040, // AIS Class A, B Position (existing + new)
        129041, // AIS Aids to Navigation (existing)
        129283,
        129285, // Cross Track Error, Route/WP Info
        129539,
        129540, // GNSS DOPs, Satellites
        129794,
        129798,
        129799, // AIS Static Data, SAR, Radio Frequency
        129802,
        129808, // AIS Safety Related, DSC Call
        130306,
        130312, // Wind Data, Temperature (existing)
        130576, // Small Craft Status
      ];

      const receivePGNs = [
        59904, // ISO Request
        126464, // PGN List Request
      ];

      return [
        {
          prio: 2,
          pgn: 126464,
          dst: 255,
          fields: {
            functionCode: "Transmit PGN list",
            list: transmitPGNs,
          },
        },
        {
          prio: 2,
          pgn: 126464,
          dst: 255,
          fields: {
            functionCode: "Receive PGN list",
            list: receivePGNs,
          },
        },
      ];
    },
    tests: [
      {
        input: [true], // PGN list requested
        expected: [
          {
            prio: 2,
            pgn: 126464,
            dst: 255,
            fields: {
              functionCode: "Transmit PGN list",
              list: [
                59392, 59904, 60928, 126996, 126464, 127245, 127258, 127488, 127489, 127493, 127498,
                127506, 127508, 128259, 128267, 128275, 129025, 129026, 129029, 129033, 129038,
                129039, 129040, 129041, 129283, 129285, 129539, 129540, 129794, 129798, 129799,
                129802, 129808, 130306, 130312, 130576,
              ],
            },
          },
          {
            prio: 2,
            pgn: 126464,
            dst: 255,
            fields: {
              functionCode: "Receive PGN list",
              list: [59904, 126464],
            },
          },
        ],
      },
    ],
  };
}
