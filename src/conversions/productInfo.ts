import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";

export default function createProductInfoConversion(): ConversionModule {
	return {
		title: "Product Information (PGN 126996)",
		optionKey: "PRODUCT_INFO",
		category: "system",
		keys: [
			"design.manufacturer.name",
			"design.modelNumber",
			"design.softwareVersion",
			"design.hardwareVersion",
			"design.serialNumber",
			"design.certificationLevel",
		],
		callback: (
			manufacturerName: unknown,
			modelNumber: unknown,
			softwareVersion: unknown,
			hardwareVersion: unknown,
			serialNumber: unknown,
			certificationLevel: unknown,
		): N2KMessage[] => {
			if (
				typeof manufacturerName !== "string" &&
				typeof modelNumber !== "string"
			) {
				return [];
			}

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 126996,
					dst: N2K_BROADCAST_DST,
					fields: {
						// canboat resolution 0.001: send the decimal version (2.1), encoder
						// writes raw 2100 to wire. Sending 2100 directly saturates the field.
						nmea2000Version: 2.1,
						productCode: 12345,
						modelId:
							typeof modelNumber === "string"
								? modelNumber
								: "SignalK-NMEA2000",
						softwareVersionCode:
							typeof softwareVersion === "string" ? softwareVersion : "1.0.0",
						modelVersion:
							typeof hardwareVersion === "string" ? hardwareVersion : "1.0",
						modelSerialCode:
							typeof serialNumber === "string" ? serialNumber : "SK00000001",
						certificationLevel:
							certificationLevel === "certified" ? "Level B" : "Level A",
						loadEquivalency: 1,
					},
				},
			];
		},
		tests: [
			{
				input: [
					"Signal K Systems",
					"SK-N2K-001",
					"2.1.0",
					"1.2",
					"SK12345678",
					"certified",
				],
				expected: [
					{
						prio: 2,
						pgn: 126996,
						dst: 255,
						fields: {
							nmea2000Version: 2.1,
							productCode: 12345,
							modelId: "SK-N2K-001",
							softwareVersionCode: "2.1.0",
							modelVersion: "1.2",
							modelSerialCode: "SK12345678",
							certificationLevel: "Level B",
							loadEquivalency: 1,
						},
					},
				],
			},
			{
				input: ["Signal K", null, null, null, null, null], // Minimal data
				expected: [
					{
						prio: 2,
						pgn: 126996,
						dst: 255,
						fields: {
							nmea2000Version: 2.1,
							productCode: 12345,
							modelId: "SignalK-NMEA2000",
							softwareVersionCode: "1.0.0",
							modelVersion: "1.0",
							modelSerialCode: "SK00000001",
							certificationLevel: "Level A",
							loadEquivalency: 1,
						},
					},
				],
			},
		],
	};
}
