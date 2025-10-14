export type Unit = "STUK" | "KILO";

export type CurrentPriceRow = {
    product_id: string;
    name: string;
    unit: Unit;
    price: number;
};
