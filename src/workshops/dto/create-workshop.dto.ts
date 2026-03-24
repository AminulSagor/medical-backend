import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { WorkshopDeliveryMode, WorkshopStatus } from "../entities/workshop.entity";

class CreateWorkshopSegmentDto {
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

class CreateWorkshopDayDto {
    // "2026-02-22"
    @IsString()
    date: string;

    @IsInt()
    @Min(1)
    dayNumber: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateWorkshopSegmentDto)
    segments: CreateWorkshopSegmentDto[];
}

class CreateWorkshopGroupDiscountDto {
    @IsInt()
    @Min(1)
    minimumAttendees: number;

    // numeric as string ok, same as your products style
    @IsString()
    groupRatePerPerson: string;
}

export class CreateWorkshopDto {
    @IsEnum(WorkshopDeliveryMode)
    deliveryMode: WorkshopDeliveryMode;

    @IsOptional()
    @IsEnum(WorkshopStatus)
    status?: WorkshopStatus;

    @IsString()
    @MaxLength(220)
    title: string;

    @IsOptional()
    @IsString()
    shortBlurb?: string;

    @IsOptional()
    @IsString()
    coverImageUrl?: string;

    @IsOptional()
    @IsString()
    learningObjectives?: string;

    @IsBoolean()
    offersCmeCredits: boolean;

    @IsArray()
    @IsString({ each: true })
    facilityIds: string[];

    // Online workshop specific fields (optional, used when deliveryMode is "online")
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

    @IsInt()
    @Min(1)
    capacity: number;

    @IsInt()
    @Min(0)
    alertAt: number;

    @IsString()
    standardBaseRate: string;

    @IsBoolean()
    groupDiscountEnabled: boolean;

    // if enabled=true, you will send at least one record
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateWorkshopGroupDiscountDto)
    groupDiscounts?: CreateWorkshopGroupDiscountDto[];

    // assign existing faculty IDs (your faculty create API already exists)
    @IsOptional()
    @IsArray()
    @IsUUID("4", { each: true })
    facultyIds?: string[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateWorkshopDayDto)
    days: CreateWorkshopDayDto[];
}