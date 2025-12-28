import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Put,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { HostDashboardDto } from './dto/host-dashboard.dto';
import { GetUser } from 'src/auth/GetUser.Decorator';

@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  createBooking(
    @Body() createBookingDto: CreateBookingDto,
    @GetUser() user: any,
  ) {
    // Members can book activities
    return this.bookingService.createBooking(
      createBookingDto,
      user._id.toString(),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('member/my-bookings')
  getMemberBookings(@GetUser() user: any) {
    // Get all bookings for the current member
    return this.bookingService.getMemberBookings(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('host/pending')
  getHostPendingBookings(@GetUser() user: any) {
    // Get all pending bookings for the current host
    return this.bookingService.getHostPendingBookings(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('host/dashboard')
  getHostDashboard(
    @Query() query: HostDashboardDto,
    @GetUser() user: any,
  ) {
    // Get dashboard data for host with filters
    return this.bookingService.getHostDashboard(
      user._id.toString(),
      query.status,
      query.activityId,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id/approve')
  approveBooking(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    // Host can approve bookings
    return this.bookingService.approveBooking(id, user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id/decline')
  declineBooking(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateBookingStatusDto,
    @GetUser() user: any,
  ) {
    // Host can decline bookings
    return this.bookingService.declineBooking(
      id,
      user._id.toString(),
      updateStatusDto.declineReason,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  getBookingById(@Param('id') id: string, @GetUser() user: any) {
    // Get booking details (member, host, or superAdmin can view)
    return this.bookingService.getBookingById(id, user._id.toString());
  }
}

