function chooseFile() {
  document.getElementById('qr-input-file').click();
}

/*
read QR from image
*/
const html5QrCode = new Html5Qrcode(/* element id */
"reader");

var f = null;
// File based scanning
const fileinput = document.getElementById('qr-input-file');

var __emvcoobj__ = null;
var __original__ = null;

fileinput.addEventListener('change', e => {
    if (e.target.files.length == 0) {
        // No file selected, ignore
        return;
    }

    // Use the first item in the list
    const imageFile = e.target.files[0];

    reduceImageSize(imageFile, (smallFile) => {
        // console.log("redueced image file");
        // console.log(smallFile);
        html5QrCode.scanFile(smallFile, /* showImage= */
        false).then(qrCodeMessage => {
            // success, use qrCodeMessage
            document.getElementById('code').value = qrCodeMessage;
            checkEmvCode();
        }
        ).catch(err => {
            // failure, handle it
            document.getElementById('formated').innerText = `Error scanning file. Reason: ${err}`;
            document.getElementById('qr').src = "";

        }
        );
    }

    );

}
);

/*
paste from clip board
*/
async function pasteImage() {
    try {
        const permission = await navigator.permissions.query({
            name: "clipboard-read",
        });
        if (permission.state === "denied") {
            throw new Error("Not allowed to read clipboard.");
        }
        const clipboardContents = await navigator.clipboard.read();
        for (const item of clipboardContents) {
            if (!item.types.includes("image/png")) {
                throw new Error("Clipboard contains non-image data.");
            }
            const blob = await item.getType("image/png");

            var file = new File([blob],"qr")
            html5QrCode.scanFile(file, /* showImage= */
            false).then(qrCodeMessage => {
                // success, use qrCodeMessage
                document.getElementById('code').value = qrCodeMessage;
                checkEmvCode();
            }
            ).catch(err => {
                // failure, handle it
                document.getElementById('formated').innerText = `Error scanning file. Reason: ${err}`;
                document.getElementById('qr').src = "";
                document.getElementById('code').value = "";

            }
            );
        }
    } catch (error) {
        //console.error(error.message);
        // failure, handle it
        document.getElementById('formated').innerText = error.message;
        document.getElementById('qr').src = "";
        document.getElementById('code').value = "";
    }
}

/*
reduce imageFile size
*/
function reduceImageSize(imageFile, onFinished) {
    var reader = new FileReader();
    reader.readAsDataURL(imageFile);
    reader.onloadend = function(e) {
        var image = new Image();
        image.src = e.target.result;
        image.onload = function(ev) {
            var canvas = document.getElementById('canvas');
            canvas.style.display = 'None';

            var aspectRatio = image.height / image.width;
            canvas.width = Math.min(300, image.width / 2);
            canvas.height = canvas.width * aspectRatio;

            var ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);

            canvas.toBlob( (blob) => {
                var file = new File([blob],"image.png");
                onFinished(file);
            }
            );
        }
    }
}

/*
decode emv code
*/
var result;
function checkEmvCode() {
    var code = document.getElementById('code').value;

    result = {
        'original': code,
        'emvobj': null,
        'error': 'success',
        'message': ''
    };

    //validate
    [result.original,result.error,result.message] = validateEmvCode(code);
    if (result.error == 'warning')
        document.getElementById('code').value = result.original;

    //parse
    result.emvobj = tlvDecode(code);

    //print
    if (result.error != 'error') {
      __emvcoobj__ = result.emvobj;
      __original__ = result.original;
      displayEmvcoCode(__emvcoobj__, __original__);
    } else {
        document.getElementById('formated').innerText = result.message;
        document.getElementById('qr').src = "https://quickchart.io/chart?chs=220x220&cht=qr&chl=" + encodeURIComponent(result.original);
    }

    return result;
}

function displayEmvcoCode(emvobj, original) {
  document.getElementById('formated').replaceChildren(printTLV(emvobj, emvobj));
  document.getElementById('qr').src = "https://quickchart.io/chart?chs=220x220&cht=qr&chl=" + encodeURIComponent(original);
}

function validateEmvCode(code) {
    //check if code is value
    if (code == '' || code.length < 10 || code.slice(-8, -4) != '6304') {
        return [code, "error", "not emv qr"];
    }

    //check crc
    var ori_crc = code.slice(-4);
    var calc_crc = crc16(code.slice(0, -4));

    if (ori_crc != calc_crc) {
        newcode = code.slice(0, -4) + calc_crc;
        return [newcode, "warning", `invalid CRC, shall be ${calc_crc}`];
    }

    return [code, "success", ""];
}

function emvobjCorrect(emvobj) {
  var correctItem = function(item) {
    if (typeof item.v == 'string') {
      return Number(item.l) + 4;
    }

    var result = 0;
    for (let i = 0; i < item.v.length; i++) {
      var childL = correctItem(item.v[i]);
      result += childL;
    }
    item.l = pad(result); 

    return result + 4;
  }

  for (let item of emvobj) {
    correctItem(item);
  }

  return emvobj
}

function emvobjToCode(emvobj) {
  var toCode = function(item) {
    if (typeof item.v == 'string') {
      return item.t + pad(item.l) + item.v;
    }

    var result = '';
    for (let i = 0; i < item.v.length; i++) {
      result += toCode(item.v[i])
    }

    return item.t + pad(item.l) + result;
  }

  var result = '';
  for (let item of emvobj) {
    if (item.t != '63') {
      result += toCode(item);
    } else {
      result += '6304' + crc16(result + '6304');
    }
  }

  return result
}

function tlvDecode(code) {
    var list = [];
    var offset = 0;
    while (offset < code.length) {
        var t = code.slice(offset + 0, offset + 2);
        var l = code.slice(offset + 2, offset + 4);

        if (isNaN(t) || isNaN(l) || Number(l) <= 0 || offset + 4 + Number(l) > code.length) {
            console.log("invalid tlv:" + code);
            return code;
            //invalid tlv, shall not parse it.
        }
        var length = Number(l);
        var v = code.slice(offset + 4, offset + 4 + length);

        offset = offset + 4 + length;
        v = tlvDecode(v);

        list.push({
            "t": t,
            "l": l,
            "v": v
        });
    }

    return list;
}

function pad(d) {
  if (typeof d == 'string') return d;
  return (d < 10) ? '0' + d.toString() : d.toString();
}

function printTLV(item, tags, indent=0) {
    if (typeof tags == 'string') {
      var container = document.createElement('span');
      var span = document.createElement('span');
      span.id = tags;

      const handledbclick = (span) => function() {
        span.style.display = 'none';
        var input = document.createElement('input');
        input.value = span.innerText;

        input.onblur = function(e) {
          if (input.value !== item.v) {
            item.v = input.value;
            item.l = input.value.length

            __emvcoobj__ = emvobjCorrect(__emvcoobj__);
            __original__ = emvobjToCode(__emvcoobj__);
            document.getElementById('code').value = __original__;

            checkEmvCode();
          } else {
            const newSpan = document.createElement('span');
            newSpan.innerText = item.v;
            newSpan.ondblclick = handledbclick(newSpan);

            input.replaceWith(newSpan);
          }
        }

        span.replaceWith(input);
        input.focus();
      };

      span.ondblclick = handledbclick(span);
      span.innerText = tags;
      container.appendChild(span);
      container.appendChild(document.createElement('br'));

      return container;
    }

    var root = document.createElement('div');

    var first = document.createElement('span');
    root.appendChild(first);

    for (var i = 0; i < tags.length; i++) {
        var item = tags[i];
        if (!item.v) break;

        var second = document.createElement('span');
        second.innerText = " . . . ".repeat(indent);
        root.appendChild(second);

        var third = document.createElement('span');
        third.innerText = item.t + " " + item.l + " ";
        root.appendChild(third);
        root.appendChild(printTLV(item, item.v, indent + 1));
    }

    return root;
}

function crc16(str) {
    var utf8enocder = new TextEncoder();
    var data = utf8enocder.encode(str);

    var crc = 0xFFFF;
    for (var i = 0; i < data.length; i++) {
        crc ^= data[i] << 8;
        for (var j = 0; j < 8; j++) {
            if ((crc & 0x8000) > 0)
                crc = (crc << 1) ^ 0x1021;
            else
                crc = crc << 1;

            crc &= 0xFFFF;
        }
    }

    return crc.toString(16).toUpperCase().padStart(4, '0');
}