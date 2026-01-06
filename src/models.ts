export interface User {
    id: string;
    username: string;
    fullName: string;
}

export interface CountHistory {
    time: number;
    followersCount: number;
    followingCount: number;
}

export interface FollowersHistory {
    time: number;
    added: User[];
    removed: User[];
}

export interface CountDelta {
    added: number;
    removed: number;
}
