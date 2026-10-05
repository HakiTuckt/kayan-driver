export const driverDocumentTypes = ['drivers_license', 'national_registration_card', 'vehicle_registration', 'roadworthiness_certificate'] as const;
export type DriverDocumentType = typeof driverDocumentTypes[number];
export type DriverDocuments = Record<DriverDocumentType, File>;
