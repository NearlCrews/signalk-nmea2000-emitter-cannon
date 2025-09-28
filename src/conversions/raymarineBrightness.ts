import type { ConversionModule, N2KMessage } from '../types/index.js';

interface BrightnessGroup {
  signalkId: string;
  instanceId: string;
}

interface BrightnessOptions {
  RAYMARINE_BRIGHTNESS?: {
    groups?: BrightnessGroup[];
  };
}

export default function createRaymarineBrightnessConversions(options: BrightnessOptions): ConversionModule[] {
  const groups = options.RAYMARINE_BRIGHTNESS?.groups;
  
  if (!groups || !Array.isArray(groups) || groups.length === 0) {
    return [];
  }

  return groups.map((group: BrightnessGroup) => {
    return {
      title: `Raymarine Display Brightness ${group.instanceId} (126720)`,
      optionKey: "RAYMARINE_BRIGHTNESS",
      keys: [`electrical.displays.raymarine.${group.signalkId}.brightness`],
      callback: (brightness: unknown): N2KMessage[] => {
        if (typeof brightness !== 'number') {
          return [];
        }

        return [
          {
            prio: 2,
            pgn: 126720,
            dst: 255,
            fields: {
              manufacturerCode: "Raymarine",
              industryCode: "Marine Industry",
              proprietaryId: "0x0c8c",
              group: group.instanceId || "Helm 2",
              unknown1: 1,
              command: "Brightness",
              brightness: (brightness || 0) * 100,
              unknown2: 0,
            },
          },
        ];
      },
      tests: [
        {
          input: [0.85],
          expected: [
            {
              prio: 2,
              pgn: 126720,
              dst: 255,
              fields: {
                manufacturerCode: "Raymarine",
                industryCode: "Marine Industry",
                proprietaryId: "0x0c8c",
                group: "Helm 2",
                unknown1: 1,
                command: "Brightness",
                brightness: 85,
                unknown2: 0,
              },
            },
          ],
        },
      ],
    };
  });
}

// Factory function for creating with test options
export function createRaymarineBrightnessWithTestOptions(): ConversionModule[] {
  const testOptions: BrightnessOptions = {
    RAYMARINE_BRIGHTNESS: {
      groups: [
        {
          signalkId: "helm2",
          instanceId: "Helm 2",
        },
      ],
    },
  };

  return createRaymarineBrightnessConversions(testOptions);
}
