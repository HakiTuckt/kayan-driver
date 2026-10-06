import type { DriverProfile } from '@/components/driver/DriverRegistration';

export type FuelEstimate = {
  minimum: number;
  maximum: number;
  unit: 'L' | 'kWh';
};

function getEngineLitres(engineTrim: string) {
  const ccMatch = engineTrim.match(/\b(\d{3,4})\s*(?:cc|cm3|cm³)\b/i);
  if (ccMatch) return Number(ccMatch[1]) / 1000;

  const litreMatch = engineTrim.match(/\b(\d(?:\.\d{1,2})?)\s*(?:l|litre|liter)\b/i);
  if (!litreMatch) return null;
  const litres = Number(litreMatch[1]);
  return litres > 0 && litres <= 10 ? litres : null;
}

function modelSizeFactor(make: string, model: string) {
  const vehicle = `${make} ${model}`.toLowerCase();
  if (/\b(hilux|land cruiser|landcruiser|prado|fortuner|rav4|rAV4|x-trail|xtrail|cr-v|crv|pajero|outlander|forester|cx-[3579]|rx\d*)\b/i.test(vehicle)) {
    return 1.2;
  }
  if (/\b(corolla|axio|fielder|vitz|yaris|fit|jazz|demio|mazda ?[23]|swift|march|note|allion|premio|civic|prius)\b/i.test(vehicle)) {
    return 0.96;
  }
  return 1.08;
}

function modelYearFactor(year: number) {
  if (year < 2005) return 1.18;
  if (year < 2011) return 1.12;
  if (year < 2017) return 1.06;
  if (year < 2022) return 1;
  return 0.96;
}

export function estimateRouteFuel(profile: DriverProfile, distanceMeters: number): FuelEstimate | null {
  const distanceKm = distanceMeters / 1000;
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;

  const isLargeVehicle = modelSizeFactor(profile.make, profile.model) > 1.1;
  if (profile.fuelType === 'electric') {
    const consumptionPer100Km = isLargeVehicle ? 23 : 18;
    return {
      minimum: distanceKm * consumptionPer100Km * 0.8 / 100,
      maximum: distanceKm * consumptionPer100Km * 1.25 / 100,
      unit: 'kWh',
    };
  }

  const engineLitres = getEngineLitres(profile.engineTrim);
  if (!engineLitres) return null;
  const baselinePer100Km = profile.fuelType === 'diesel'
    ? 4.1 + engineLitres * 1.55
    : profile.fuelType === 'hybrid'
      ? 3.4 + engineLitres * 1.35
      : 4.8 + engineLitres * 1.95;
  const consumptionPer100Km = baselinePer100Km
    * modelSizeFactor(profile.make, profile.model)
    * modelYearFactor(Number(profile.year));

  return {
    minimum: distanceKm * consumptionPer100Km * 0.8 / 100,
    maximum: distanceKm * consumptionPer100Km * 1.25 / 100,
    unit: 'L',
  };
}
