import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateScreeningDto {
  @IsString() @IsNotEmpty()
  title: string;

  @IsString() @IsNotEmpty()
  organizerId: string;

  @IsString() @IsNotEmpty()
  venueId: string;

  @IsString() @IsNotEmpty()
  showDate: string;

  @IsString() @IsNotEmpty()
  showTime: string;

  @IsString() @IsNotEmpty()
  location: string;

  @IsInt() @Min(1)
  expectedAudience: number;

  @IsString() @IsNotEmpty()
  filmName: string;

  @IsString() @IsNotEmpty()
  copyrightProof: string;

  @IsString() @IsNotEmpty()
  copyrightOwner: string;

  @IsString() @IsNotEmpty()
  powerCondition: string;

  @IsString() @IsNotEmpty()
  screenSize: string;

  @IsInt() @Min(0)
  speakerCount: number;

  @IsInt() @Min(0)
  securityStaff: number;

  @IsString() @IsNotEmpty()
  rainPlan: string;

  @IsOptional() @IsString()
  siteManagerName?: string;

  @IsOptional() @IsString()
  securityLeadName?: string;

  /** 受限场地要求的提前降噪测试凭证/说明 */
  @IsOptional() @IsString()
  noiseTestProof?: string;
}
