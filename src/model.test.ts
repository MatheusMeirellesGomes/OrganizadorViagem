import {describe,it,expect} from 'vitest';
import {newTrip,moveActivity,dateLabel} from './model';
describe('optional trip planning',()=>{
 it('creates a trip without dates, destination or budget',()=>{const trip=newTrip();expect(trip.title).toBe('Nova viagem');expect(trip.start).toBe('');expect(trip.destination).toBe('');expect(trip.budgetEnabled).toBe(false);expect(trip.expenses).toEqual([]);expect(dateLabel(trip)).toBe('Datas em aberto')});
 it('keeps trip collections isolated',()=>{const a=newTrip(),b=newTrip();a.checklist.push({id:'x',title:'Test',done:false});expect(b.checklist).toHaveLength(0);expect(a.id).not.toBe(b.id)});
 it('moves an activity without losing details or changing other days',()=>{const items=[{id:'a',title:'Museum',day:1,time:'10:00',address:'Lisbon',done:true,kind:'Passeio'},{id:'b',title:'Lunch',day:2,time:'',address:'',done:false,kind:'Restaurante'}];const result=moveActivity(items,'a',3);expect(result[0]).toEqual({...items[0],day:3});expect(result[1]).toEqual(items[1]);expect(items[0].day).toBe(1)});
});
