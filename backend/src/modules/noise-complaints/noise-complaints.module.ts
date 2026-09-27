import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NoiseComplaint } from '../../entities/noise-complaint.entity';
import { Screening } from '../../entities/screening.entity';
import { Venue } from '../../entities/venue.entity';
import { TimelineEvent } from '../../entities/timeline-event.entity';
import { NoiseComplaintsService } from './noise-complaints.service';
import { NoiseComplaintsController } from './noise-complaints.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([NoiseComplaint, Screening, Venue, TimelineEvent]),
  ],
  providers: [NoiseComplaintsService],
  controllers: [NoiseComplaintsController],
  exports: [NoiseComplaintsService],
})
export class NoiseComplaintsModule {}
