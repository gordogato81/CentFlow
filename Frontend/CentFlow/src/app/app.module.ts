import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DialogComponent } from './dialog/dialog.component';
import { OverlayModule } from '@angular/cdk/overlay';
import { MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ApiService } from './service/api.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { ReactiveFormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
@NgModule({
  declarations: [
    AppComponent,
    DialogComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    OverlayModule,
    MatDialogModule,
    MatCardModule,
    MatFormFieldModule,
    MatNativeDateModule,
    MatDatepickerModule,
    ReactiveFormsModule,
    MatSelectModule,
    // MatProgressBarModule,
    // MatCheckboxModule,
    FormsModule
  ],
  providers: [ApiService, AppComponent],
  bootstrap: [AppComponent]
})
export class AppModule { }
