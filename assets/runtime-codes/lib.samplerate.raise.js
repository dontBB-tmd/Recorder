/******************
《【Demo库】PCM采样率提升》
作者：高坚果
时间：2020-1-9 20:48:39

文档：
Recorder.SampleRaise(pcmDatas,pcmSampleRate,newSampleRate)
		pcmDatas: [[Int16,...]] pcm片段列表，二维数组
		pcmSampleRate：pcm的采样率
		newSampleRate：要转换成的采样率
		
		返回值：{
			sampleRate:16000 结果的采样率，>=pcmSampleRate
			data:[Int16,...] 转换后的PCM结果
		}
		
本方法将简单的提升pcm的采样率，如果新采样率低于pcm采样率，将不会进行任何处理。采用的简单算法能力有限，会引入能感知到的轻微杂音。

Recorder.SampleData只提供降低采样率，不提供提升采样率，因为由低的采样率转成高的采样率没有存在的意义。提升采样率的代码不会作为核心功能提供，但某些场合确实需要提升采样率，可自行编写代码转换一下即可。
******************/

//=====采样率提升核心函数==========
Recorder.SampleRaise=function(pcmDatas,pcmSampleRate,newSampleRate){
	var size=0;
	for(var i=0;i<pcmDatas.length;i++){
		size+=pcmDatas[i].length;
	};
	
	var step=newSampleRate/pcmSampleRate;
	if(step<=1){//新采样不高于pcm采样率不处理
		step=1;
		newSampleRate=pcmSampleRate;
	}else{
		size=Math.floor(size*step);
	};
	
	var res=new Int16Array(size);
	
	//处理数据
	var posFloat=0,prev=0;
	for (var index=0,nl=pcmDatas.length;index<nl;index++) {
		var arr=pcmDatas[index];
		for(var i=0;i<arr.length;i++){
			var cur=arr[i];
			
			var pos=Math.floor(posFloat);
			posFloat+=step;
			var end=Math.floor(posFloat);
			
			//简单的从prev平滑填充到cur，有效减少转换引入的杂音
			var n=(cur-prev)/(end-pos);
			for(var j=1;pos<end;pos++,j++){
				//res[pos]=cur;
				res[pos]=Math.floor(prev+(j*n));
			};
			
			prev=cur;
		};
	};
	
	return {
		sampleRate:newSampleRate
		,data:res
	};
};



//************测试************
var sampleRaiseInfo=window.sampleRaiseInfo||{from:16000,to:44100};
var transform=function(buffers,sampleRate){
	sampleRaiseInfo.buffers=buffers;
	sampleRaiseInfo.sampleRate=sampleRate;
	if(!buffers){
		Runtime.Log("请先录个音",1);
		return;
	};
	var from=sampleRaiseInfo.from;
	var to=sampleRaiseInfo.to;
	
	//准备低采样率数据
	var pcmFrom=Recorder.SampleData(buffers,sampleRate,from).data;
	
	//转换成高采样率
	var pcmTo=Recorder.SampleRaise([pcmFrom],from,to).data;
	
	var mockFrom=Recorder({type:"wav",sampleRate:from}).mock(pcmFrom,from);
	mockFrom.stop(function(blob1,duration1){
		
		var mockTo=Recorder({type:"wav",sampleRate:to}).mock(pcmTo,to);
		mockTo.stop(function(blob2,duration2){
			Runtime.Log(from+"->"+to,2);
			
			Runtime.LogAudio(blob1,duration1,mockFrom,"低采样");
			Runtime.LogAudio(blob2,duration2,mockTo,"高采样");
		});
		
	});
};
var k8k16=function(){
	sampleRaiseInfo.from=8000;
	sampleRaiseInfo.to=16000;
	
	transform(sampleRaiseInfo.buffers,sampleRaiseInfo.sampleRate);
};
var k16k441=function(){
	sampleRaiseInfo.from=16000;
	sampleRaiseInfo.to=44100;
	
	transform(sampleRaiseInfo.buffers,sampleRaiseInfo.sampleRate);
};




//******音频数据源，采集原始音频用的******
//显示控制按钮
Runtime.Ctrls([
	{name:"开始录音",click:"recStart"}
	,{name:"结束录音",click:"recStop"}
	,{html:"<hr/>"}
	,{name:"8k转16k",click:"k8k16"}
	,{name:"16k转44.1k",click:"k16k441"}
]);


//加载录音框架
Runtime.Import([
	{url:RootFolder+"/src/recorder-core.js",check:function(){return !window.Recorder}}
	,{url:RootFolder+"/src/engine/wav.js",check:function(){return !Recorder.prototype.wav}}
]);

//调用录音
var rec;
function recStart(){
	rec=Recorder({
		type:"wav"
		,sampleRate:48000
		,bitRate:16
		,onProcess:function(buffers,powerLevel,bufferDuration,bufferSampleRate){
			Runtime.Process.apply(null,arguments);
		}
	});
	var t=setTimeout(function(){
		Runtime.Log("无法录音：权限请求被忽略（超时假装手动点击了确认对话框）",1);
	},8000);
	
	rec.open(function(){//打开麦克风授权获得相关资源
		clearTimeout(t);
		rec.start();//开始录音
	},function(msg,isUserNotAllow){//用户拒绝未授权或不支持
		clearTimeout(t);
		Runtime.Log((isUserNotAllow?"UserNotAllow，":"")+"无法录音:"+msg, 1);
	});
};
function recStop(){
	rec.stop(function(blob,duration){
		Runtime.LogAudio(blob,duration,rec);
		
		transform(rec.buffers,rec.srcSampleRate);
	},function(msg){
		Runtime.Log("录音失败:"+msg, 1);
	},true);
};



//*****拖拽或者选择文件******
$(".choiceFileBox").remove();
Runtime.Log('<div class="choiceFileBox">\
	<div class="dropFile" onclick="$(\'.choiceFile\').click()" style="border: 3px dashed #a2a1a1;background:#eee; padding:30px 0; text-align:center;cursor: pointer;">\
	拖拽多个音乐文件到这里 / 点此选择，并转换\
	</div>\
	<input type="file" class="choiceFile" style="display:none" accept="audio/*" multiple="multiple">\
</div>');
$(".dropFile").bind("dragover",function(e){
	e.preventDefault();
}).bind("drop",function(e){
	e.preventDefault();
	
	readChoiceFile(e.originalEvent.dataTransfer.files);
});
$(".choiceFile").bind("change",function(e){
	readChoiceFile(e.target.files);
});
function readChoiceFile(files){
	if(!files.length){
		return;
	};
	
	Runtime.Log("发现"+files.length+"个文件，开始转换...");
	
	var idx=-1;
	var run=function(){
		idx++;
		if(idx>=files.length){
			return;
		};
		
		var file = files[idx];
		var reader = new FileReader();
		reader.onload = function(e){
			decodeAudio(file.name,e.target.result,run);
		}
		reader.readAsArrayBuffer(file);
	};
	run();
};
var decodeAudio=function(name,arr,call){
	if(!Recorder.Support()){//强制激活Recorder.Ctx 不支持大概率也不支持解码
		Runtime.Log("浏览器不支持音频解码",1);
		return;
	};
	var srcBlob=new Blob([arr],{type:"audio/"+(/[^.]+$/.exec(name)||[])[0]});
	var ctx=Recorder.Ctx;
	ctx.decodeAudioData(arr,function(raw){
		var src=raw.getChannelData(0);
		var sampleRate=raw.sampleRate;
		console.log(name,raw,srcBlob);
		
		var pcm=new Int16Array(src.length);
		for(var i=0;i<src.length;i++){//floatTo16BitPCM 
			var s=Math.max(-1,Math.min(1,src[i]));
			s=s<0?s*0x8000:s*0x7FFF;
			pcm[i]=s;
		};
		
		Runtime.LogAudio(srcBlob,Math.round(src.length/sampleRate*1000),{set:{sampleRate:sampleRate}},"已解码"+name);
		
		rec=null;
		transform([pcm],sampleRate);
		
		call();
	},function(e){
		Runtime.Log("audio解码失败:"+e.message,1);
	});
};


Runtime.Log("结束录音转换格式以最后点击的哪个为准");