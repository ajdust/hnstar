import { addMinutes, format as dateformat } from "date-fns";

export function createRegExp(regex: string): RegExp | null {
    try {
        const reg = new RegExp(regex);
        return reg;
    } catch {
        return null;
    }
}

export function optionalNumberToString(n: number | undefined): string {
    return n ? n.toString() : "";
}

export function epochToDateInputValue(epoch: number | undefined): string {
    return !epoch ? "" : dateformat(new Date(epoch * 1000), "yyyy-MM-dd");
}

export function dateInputValueToEpoch(date: string): number | undefined {
    if (!date || date.trim() === "") return undefined;
    let dt = new Date(date);
    // undo timezone adaption
    dt = addMinutes(dt, dt.getTimezoneOffset());

    return date.trim() === "" ? undefined : Math.ceil(dt.getTime() / 1000);
}
