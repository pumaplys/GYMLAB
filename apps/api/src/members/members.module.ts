import { Module } from '@nestjs/common';
import { MembersController, OwnMemberProfileController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  controllers: [MembersController, OwnMemberProfileController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
