export function calculateTimeDifference(startTime: Date, endTime: Date): number {
    return endTime.getTime() - startTime.getTime();
}

export function formatTimestamp(date: Date): string {
    return date.toISOString();
}

export function getCurrentTimestamp(): string {
    return new Date().toISOString();
}