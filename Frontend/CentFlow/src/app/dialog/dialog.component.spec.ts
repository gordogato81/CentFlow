import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

import { DialogComponent } from './dialog.component';
import { ApiService } from '../service/api.service';

describe('DialogComponent', () => {
  let component: DialogComponent;
  let fixture: ComponentFixture<DialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DialogComponent],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            d: {
              cid: 1,
              lat: 0,
              lon: 0,
              startdate: '2020-01-01',
              enddate: '2020-01-07',
              tfh: 1,
            },
            data: [],
            interval: 'week',
            rangeStart: '2020-01-01',
            rangeEnd: '2020-01-07',
          },
        },
        {
          provide: ApiService,
          useValue: {},
        },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DialogComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
