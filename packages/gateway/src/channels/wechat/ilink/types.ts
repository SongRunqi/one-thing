export interface WeixinMessage {
  seq?: number
  message_id?: number
  from_user_id?: string
  to_user_id?: string
  client_id?: string
  create_time_ms?: number
  update_time_ms?: number
  delete_time_ms?: number
  session_id?: string
  group_id?: string
  message_type?: number
  message_state?: number
  context_token?: string
  run_id?: string
  item_list?: Array<{
    type?: number
    text_item?: { text: string }
  }>
}

export interface GetUpdatesResponse {
  ret?: number
  errcode?: number
  errmsg?: string
  msgs?: WeixinMessage[]
  sync_buf?: string
  get_updates_buf?: string
  longpolling_timeout_ms?: number
}
