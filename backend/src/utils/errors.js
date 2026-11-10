export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function databaseError(error) {
  if(error.code==='P0002')return new ApiError(404,'NOT_FOUND','Suggestion not found.');
  if (error.code === '23505' || error.message?.includes('Batch key payload mismatch')) return new ApiError(409,'CONFLICT','Duplicate identifier or conflicting import replay.');
  if (['23514','23502','22P02','22007','22008'].includes(error.code)) return new ApiError(400,'VALIDATION_ERROR','Invalid record values.');
  if (error.code === '42501') return new ApiError(403,'FORBIDDEN','Operation is not permitted.');
  return new ApiError(503,'DATABASE_UNAVAILABLE','Database operation could not be completed.');
}
