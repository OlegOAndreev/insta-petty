import type { User } from "./models.js";

export function getById<T extends HTMLElement>(elementId: string): T {
    const element = document.getElementById(elementId);
    if (!element) {
        throw new Error(`Element with id "${elementId}" not found`);
    }
    return element as T;
}

export function truncateMessage(str: string, maxLength: number): string {
    if (str.length <= maxLength) {
        return str;
    }
    return str.substring(0, maxLength) + '...';
}

export function timestampToStr(time: number): string {
    const date = new Date(time);
    const dateStr = date.toLocaleDateString(undefined, { dateStyle: 'medium' });
    const timeStr = date.toLocaleTimeString(undefined, { timeStyle: 'short', hourCycle: 'h24' });
    return `${dateStr} ${timeStr}`;
}

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// For some reason (bad paging?) we may get duplicate users in following or followers lists.
export function deduplicateUsers(users: User[]): User[] {
    const origLength = users.length;
    const result: User[] = [];
    const seenIds: Set<string> = new Set();
    for (const user of users) {
        if (seenIds.has(user.id)) {
            console.debug('Duplicate user', user);
            continue;
        }
        seenIds.add(user.id);
        result.push(user);
    }
    console.log(`Got list of ${users.length} from the list of ${origLength} users`);
    return result;
}
