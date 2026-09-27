import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NoiseReview } from '../../entities/noise-review.entity';
import { Screening } from '../../entities/screening.entity';
import { Incident } from '../../entities/incident.entity';
import { Settlement } from '../../entities/settlement.entity';
import { TimelineEvent } from '../../entities/timeline-event.entity';
import { Venue } from '../../entities/venue.entity';
import { VenuesModule } from '../venues/venues.module';
import { NoiseReviewsService } from './noise-reviews.service';
import { NoiseReviewsController, ScreeningNoiseReviewsController } from './noise-reviews.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([NoiseReview, Screening, Incident, Settlement, TimelineEvent, Venue]),
    VenuesModule,
  ],
  providers: [NoiseReviewsService],
  controllers: [ScreeningNoiseReviewsController, NoiseReviewsController],
  exports: [NoiseReviewsService],
})
export class NoiseReviewsModule {}
