import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class PublicListWorkshopsQueryDto {
  // ─── Pagination ─────────────────────────────────────────────────────────────
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 10;

  // ─── Sorting ─────────────────────────────────────────────────────────────────
  @IsOptional()
  @IsIn(["date", "price", "title"])
  sortBy?: "date" | "price" | "title" = "date";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc" = "asc";

  // ─── Filters ─────────────────────────────────────────────────────────────────

  /** Workshop type filter: in_person | online */
  @IsOptional()
  @IsIn(["in_person", "online"])
  deliveryMode?: "in_person" | "online";


  /** Seat availability: 'true' = has seats, 'false' = fully booked */
  @IsOptional()
  @IsIn(["true", "false"])
  hasAvailableSeats?: "true" | "false";

  /**
   * CME credits range filter.
   * minCmeCredits: only workshops offering >= this many CME credits.
   * e.g. minCmeCredits=4
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minCmeCredits?: number;

  /**
   * maxCmeCredits: only workshops offering <= this many CME credits.
   * e.g. maxCmeCredits=12
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxCmeCredits?: number;

  /**
   * Upcoming filter: 'true' returns only workshops starting today or later.
   * Leave empty (or 'false') to return ALL workshops (past + upcoming).
   */
  @IsOptional()
  @IsIn(["true", "false"])
  upcoming?: "true" | "false";

  /**
   * Topic filter — case-insensitive substring match against segment courseTopic.
   * e.g. topic=cardiology
   */
  @IsOptional()
  @IsString()
  topic?: string;

  /**
   * Date range filters (ISO 8601 date strings: YYYY-MM-DD).
   * dateFrom: workshops whose first day is on or after this date.
   */
  @IsOptional()
  @IsString()
  dateFrom?: string;

  /** dateTo: workshops whose first day is on or before this date. */
  @IsOptional()
  @IsString()
  dateTo?: string;

  /** General title / short-blurb text search */
  @IsOptional()
  @IsString()
  q?: string;
}

