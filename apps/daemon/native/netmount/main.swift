// hlabs-netmount: mounts an SMB share with Apple's NetFS (D-060). The password is read from stdin, never from the
// command line, so it can't be seen in the process list. NetFS only mounts in /Volumes for a normal user, so the
// share appears there (and in Finder); the mount point is printed on stdout.
//
//   hlabs-netmount mount <smb://host/share> [user]    (password on stdin when a user is given)
//
// Exit 0 on success. On failure it prints `errno=<n>` to stderr and exits 2 (64 for bad usage).
import Foundation
import NetFS

func usage() -> Never {
  FileHandle.standardError.write(Data("usage: hlabs-netmount mount <smb://host/share> [user]\n".utf8))
  exit(64)
}

let args = CommandLine.arguments
guard args.count >= 3, args[1] == "mount", let url = URL(string: args[2]), url.scheme == "smb" else { usage() }
let user: String? = args.count > 3 ? args[3] : nil
let password: String? = user == nil ? nil : (readLine(strippingNewline: true) ?? "")

// No dialogs; guest access when there is no user.
let openOptions = NSMutableDictionary()
openOptions[kNAUIOptionKey as String] = kNAUIOptionNoUI as String
if user == nil { openOptions[kNetFSUseGuestKey as String] = true }

var mountpoints: Unmanaged<CFArray>?
let status = NetFSMountURLSync(
  url as CFURL, nil, user as CFString?, password as CFString?, openOptions, nil, &mountpoints)
if status != 0 {
  FileHandle.standardError.write(Data("errno=\(status)\n".utf8))
  exit(2)
}
let paths = (mountpoints?.takeRetainedValue() as? [String]) ?? []
print(paths.first ?? "")
