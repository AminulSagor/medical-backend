import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { WorkshopDeliveryMode, WorkshopStatus } from "../entities/workshop.entity";

class UpdateWorkshopSegmentDto {
    @IsInt()
    @Min(1)
    segmentNumber: number;

    @IsString()
    @MaxLength(220)
    courseTopic: string;

    @IsOptional()
    @IsString()
    topicDetails?: string;

    // "08:00 AM" (12h)
    @IsString()
    startTime: string;

    @IsString()
    endTime: string;
}

class UpdateWorkshopDayDto {
    // "2026-02-22"
    @IsString()
    date: string;

    @IsInt()
    @Min(1)
    dayNumber: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateWorkshopSegmentDto)
    segments: UpdateWorkshopSegmentDto[];
}

class UpdateWorkshopGroupDiscountDto {
    @IsInt()
    @Min(1)
    minimumAttendees: number;

    // numeric as string ok, same as your products style
    @IsString()
    groupRatePerPerson: string;
}

export class UpdateWorkshopDto {
    @IsOptional()
    @IsEnum(WorkshopDeliveryMode)
    deliveryMode?: WorkshopDeliveryMode;

    @IsOptional()
    @IsEnum(WorkshopStatus)
    status?: WorkshopStatus;

    @IsOptional()
    @IsString()
    @MaxLength(220)
    title?: string;

    @IsOptional()
    @IsString()
    shortBlurb?: string;

    @IsOptional()
    @IsString()
    coverImageUrl?: string;

    @IsOptional()
    @IsString()
    learningObjectives?: string;

    @IsOptional()
    @IsBoolean()
    offersCmeCredits?: boolean;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    facilityIds?: string[];

    // Online workshop specific fields
    @IsOptional()
    @IsString()
    @MaxLength(100)
    webinarPlatform?: string;

    @IsOptional()
    @IsString()
    meetingLink?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    meetingPassword?: string;

    @IsOptional()
    @IsBoolean()
    autoRecordSession?: boolean;

    @IsOptional()
    @IsInt()
    @Min(1)
    capacity?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    alertAt?: number;

    @IsOptional()
    @IsString()
    standardBaseRate?: string;

    @IsOptional()
    @IsBoolean()
    groupDiscountEnabled?: boolean;

    // if enabled=true, you will send at least one record
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateWorkshopGroupDiscountDto)
    groupDiscounts?: UpdateWorkshopGroupDiscountDto[];

    // assign existing faculty IDs (your faculty create API already exists)
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    facultyIds?: string[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateWorkshopDayDto)
    days?: UpdateWorkshopDayDto[];
}
