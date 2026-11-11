package com.meta.wearable.dat.externalsampleapps.cameraaccess.jhglass

fun main() {
  var total=0
  fun checkCase(s:String,final:Boolean,expected:Boolean) {
    val got=GGlassOnePhotoCommand.matchesFinalUtterance(s,final)
    check(got==expected) { "command mismatch: final=$final expected=$expected" }
    total++
  }
  checkCase("이게 뭐야?",true,true)
  checkCase("이거 뭐야",true,true)
  checkCase("이것이 뭐야?",true,true)
  checkCase("이게 뭔지 알려줘",true,true)
  checkCase("지글라스 이게 뭐야",true,true)
  checkCase("지글라스, 이거 뭐야?",true,true)
  checkCase("지글라스 이것이 뭐야",true,true)
  checkCase("지글라스 이게 뭔지 알려줘",true,true)
  checkCase("이게 뭐야",false,false)
  checkCase("이거 뭐야",false,false)
  checkCase("",true,false)
  checkCase("오늘 저녁에 이게 뭐야?",true,false)
  checkCase("환자가 이게 뭐야 라고 하시네요",true,false)
  checkCase("에비서 안녕",true,false)
  checkCase("Hey Meta start G Glass",true,false)
  checkCase("이게 뭐야 응답해 줘",true,false)
  checkCase("사진 찍지 마",true,false)
  checkCase("이게뭐야"+("a".repeat(81)),true,false)
  checkCase("이게? 뭐야!",true,true)
  checkCase("  이거. 뭐야？ ",true,true)
  checkCase("지글라스 이게 뭐야?",false,false)
  println("G_GLASS_ONE_PHOTO_COMMAND_PASS cases=$total")
}
