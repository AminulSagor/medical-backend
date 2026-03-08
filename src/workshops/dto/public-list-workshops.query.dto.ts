import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class PublicListWorkshopsQueryDto {
    @IsOptional()
    @IsIn(["in_person", "online"])
    deliveryMode?: "in_person" | "online";

    @IsOptional()
    @IsIn(["true", "false"])
    offersCmeCredits?: "true" | "false";

    @IsOptional()
    @IsIn(["true", "false"])
    hasAvailableSeats?: "true" | "false";

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number = 10;

    @IsOptional()
    @IsIn(["date", "price", "title"])
    sortBy?: "date" | "price" | "title" = "date";

    @IsOptional()
    @IsIn(["asc", "desc"])
    sortOrder?: "asc" | "desc" = "asc";
}
