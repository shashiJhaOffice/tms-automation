const parseDate = (value: string | Date) => {
    if (value instanceof Date) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (match) {
        const [, year, month, day] = match;
        return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid date: ${value}`);
    }

    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};

const dateRangeList = (startDate: Date, endDate: Date) => {
    if (startDate > endDate) {
        throw new Error("startDate must be before or equal to endDate");
    }

    const dates: Date[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
};

module.exports = {
    dateRangeList,
    formatDate,
    parseDate,
};
