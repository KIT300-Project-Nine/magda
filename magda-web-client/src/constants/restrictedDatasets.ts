// Restricted dataset configuration for demo purposes.
// Replace with backend-driven restriction when available.

export const RESTRICTED_DATASET_IDS: ReadonlyArray<string> = [
    "ds-sa-ded7c11d-2cd3-4bff-8d6f-dd850250a486"
];

export const RESTRICTED_ORGANISATIONS: ReadonlyArray<string> = [
    "Reserve Bank of Australia"
];

export function isRestrictedDataset(
    identifier: string,
    publisherName?: string,
    isLoggedIn?: boolean
): boolean {
    if (isLoggedIn) return false;
    if (RESTRICTED_DATASET_IDS.includes(identifier)) return true;
    if (publisherName && RESTRICTED_ORGANISATIONS.includes(publisherName))
        return true;
    return false;
}
