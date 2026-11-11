# Module `families` — UC-FAM-01, FR-03, BR-06, BR-11

## Thành phần

| Lớp                   | Loại       | Vai trò                                                                                                                                     |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `FamiliesController`  | boundary   | `/api/families/*` (mọi thao tác trên gia đình dùng `/me`)                                                                                   |
| `FamiliesService`     | control    | tạo, tham gia, xoá thành viên, chuyển quyền, rời/giải tán                                                                                   |
| `InviteCodeGenerator` | control    | mã mời 8 ký tự (bỏ ký tự dễ nhầm 0/O/1/I/L)                                                                                                 |
| `FamilyRepository`    | repository | bảng `families`                                                                                                                             |
| `UserRepository`      | repository | (module `users`) — đổi `users.family_id`, `role` trong transaction                                                                          |
| `Family`, `User`      | entity     | `Family.transferOwnershipTo`, `rotateInviteCode`; `User.joinFamily`, `leaveFamily`                                                          |
| `events.ts`           | sự kiện    | `FAMILY_CREATED`, `FAMILY_MEMBER_JOINED`, `FAMILY_MEMBER_REMOVED`, `FAMILY_MEMBER_LEFT`, `FAMILY_OWNERSHIP_TRANSFERRED`, `FAMILY_DISSOLVED` |

## Endpoint

| Method | Path                                  | Điều kiện                 | Lỗi nghiệp vụ chính                       |
| ------ | ------------------------------------- | ------------------------- | ----------------------------------------- |
| POST   | `/api/families`                       | chưa có gia đình          | 409 `FAMILY_ALREADY_JOINED`               |
| POST   | `/api/families/join`                  | chưa có gia đình          | 404 `FAMILY_INVITE_CODE_INVALID`, 409     |
| GET    | `/api/families/me`                    | `@RequireFamily`          | 403 `FAMILY_REQUIRED`                     |
| POST   | `/api/families/me/invite-code`        | chủ (`@Roles(HOMEMAKER)`) | 403 `FAMILY_NOT_OWNER`                    |
| DELETE | `/api/families/me/members/:userId`    | chủ                       | 404 `FAMILY_MEMBER_NOT_FOUND`, 400 tự xoá |
| POST   | `/api/families/me/transfer-ownership` | chủ                       | 404 `FAMILY_MEMBER_NOT_FOUND`             |
| POST   | `/api/families/me/leave`              | `@RequireFamily`          | 409 `FAMILY_OWNER_MUST_TRANSFER`          |

Mã mời chỉ trả về cho chủ gia đình. Sau khi tạo/tham gia/rời, app gọi `/auth/refresh`.

## Quy tắc

- **BR-11**: mọi thay đổi thành viên chạy trong một transaction, khoá dòng (`SELECT … FOR UPDATE`)
  theo thứ tự **family → user** để tránh deadlock; hai yêu cầu song song chỉ một thành công.
- **BR-06**: family_id luôn lấy từ người dùng đăng nhập; id của người thuộc gia đình khác được
  trả lời như "không tìm thấy" (404), không lộ thông tin.
- **Vai trò**: người tạo → HOMEMAKER (chủ); người tham gia → MEMBER; nhận quyền chủ → HOMEMAKER;
  rời/bị xoá → MEMBER, `family_id = NULL`.
- **Chủ rời gia đình**: còn thành viên khác → phải chuyển quyền trước; là người cuối → giải tán
  (xoá `families`, kho/danh sách/thực đơn của gia đình bị xoá theo CASCADE).

## Luồng gọi (để vẽ sequence diagram)

**Tham gia bằng mã mời**

```
App → FamiliesController.join(JoinFamilyDto{inviteCode})
  → FamiliesService.joinByInviteCode(userId, code)
      [transaction]
      → UserRepository.findByIdForUpdate(userId)      (khoá dòng user)
      → [user.familyId ≠ null] → 409 FAMILY_ALREADY_JOINED   (BR-11)
      → FamilyRepository.findByInviteCode(code)       (không có → 404)
      → User.joinFamily(familyId, MEMBER) → UserRepository.save
      [commit]
  → EventEmitter2.emit(FAMILY_MEMBER_JOINED)
  → FamiliesService.getMyFamily → FamilyResponse
```

**Rời gia đình**

```
FamiliesService.leaveFamily(userId)
  [transaction] lock family → lock user
  ├─ không phải chủ          → User.leaveFamily → emit FAMILY_MEMBER_LEFT
  ├─ chủ, còn thành viên khác → 409 FAMILY_OWNER_MUST_TRANSFER
  └─ chủ, người cuối          → User.leaveFamily → FamilyRepository.delete → emit FAMILY_DISSOLVED
```

## Máy trạng thái "thành viên" (theo `users.family_id`, `families.owner_id`)

```
[Chưa có gia đình] --createFamily--> [Chủ gia đình]
[Chưa có gia đình] --join(code)----> [Thành viên]
[Thành viên] --transferOwnership(nhận)--> [Chủ gia đình]
[Chủ gia đình] --transferOwnership(giao)--> [Thành viên vai trò HOMEMAKER]
[Thành viên] --leave / bị xoá--> [Chưa có gia đình]
[Chủ gia đình, người cuối] --leave--> [Chưa có gia đình] + gia đình bị giải tán
```
